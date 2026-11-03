import * as XLSX from "xlsx";

// Revisión de los archivos que se suben para importar (Agente de importación de Bienestar). No se confía en la extensión
// ni en el tipo que dice el navegador: se mira el contenido. Solo pasan Excel (.xlsx / .xls) y CSV sin macros, sin
// objetos incrustados, sin vínculos externos ni fórmulas que puedan ejecutar comandos, y sin "bombas" de compresión.
// Las fotos no pasan por aquí: el navegador las vuelve a dibujar como JPEG (lo que borra cualquier contenido oculto) y
// lib/fotosBienestar.js revisa su firma.

export const MAX_BYTES_ARCHIVO = 10 * 1024 * 1024;
const MAX_DESCOMPRIMIDO = 150 * 1024 * 1024;
const MAX_ENTRADAS_ZIP = 3000;
const EXTENSIONES = [".xlsx", ".xls", ".csv"];

// Partes de un .xlsx que no tienen por qué venir en una lista de personas o inventario.
const PARTES_PROHIBIDAS = [
  [/vbaproject\.bin$/i, "trae macros"],
  [/(^|\/)activex\//i, "trae controles ActiveX"],
  [/(^|\/)embeddings\//i, "trae archivos incrustados"],
  [/oleobject/i, "trae objetos incrustados"],
  [/(^|\/)externallinks\//i, "trae vínculos a otros archivos"],
  [/\.(exe|dll|js|vbs|bat|cmd|ps1|scr|jar|hta|msi|com)$/i, "trae un programa dentro"],
];
// Fórmulas o celdas de texto que intentan ejecutar algo (inyección DDE / CSV).
const FORMULA_PELIGROSA = /(cmd|powershell|mshta|rundll|regsvr|certutil|wscript|cscript)\b|\bdde\b|webservice\s*\(|filterxml\s*\(|call\s*\(|register\s*\(|exec\s*\(|\|.*!/i;

const rechazo = (nombre, motivo) => Object.assign(new Error(`No se acepta «${nombre}»: ${motivo}.`), { status: 400, rechazado: true, motivo });

const extension = (nombre) => {
  const m = String(nombre || "").toLowerCase().match(/\.[a-z0-9]+$/);
  return m ? m[0] : "";
};

// Lee el directorio central del zip (sin descomprimir) para ver qué trae y cuánto pesaría descomprimido.
function entradasZip(buf, nombre) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw rechazo(nombre, "el archivo está dañado o no es un Excel");
  const total = buf.readUInt16LE(eocd + 10);
  const inicio = buf.readUInt32LE(eocd + 16);
  if (total > MAX_ENTRADAS_ZIP) throw rechazo(nombre, "trae demasiadas partes para ser una lista");
  const entradas = [];
  let p = inicio;
  for (let k = 0; k < total; k++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw rechazo(nombre, "el archivo está dañado o no es un Excel");
    const descomprimido = buf.readUInt32LE(p + 24);
    const largoNombre = buf.readUInt16LE(p + 28);
    const largoExtra = buf.readUInt16LE(p + 30);
    const largoComentario = buf.readUInt16LE(p + 32);
    entradas.push({ nombre: buf.slice(p + 46, p + 46 + largoNombre).toString("utf8"), descomprimido });
    p += 46 + largoNombre + largoExtra + largoComentario;
  }
  return entradas;
}

function revisarXlsx(buf, nombre) {
  const entradas = entradasZip(buf, nombre);
  const nombres = entradas.map((e) => e.nombre);
  if (!nombres.includes("[Content_Types].xml") || !nombres.some((n) => n.startsWith("xl/"))) throw rechazo(nombre, "no es un libro de Excel");
  for (const n of nombres) for (const [re, motivo] of PARTES_PROHIBIDAS) if (re.test(n)) throw rechazo(nombre, motivo);
  const descomprimido = entradas.reduce((s, e) => s + e.descomprimido, 0);
  if (descomprimido > MAX_DESCOMPRIMIDO || descomprimido > buf.length * 200) throw rechazo(nombre, "descomprimido pesaría demasiado (posible archivo malicioso)");
}

function revisarXls(buf, nombre) {
  const marcas = [["_VBA_PROJECT", "trae macros"], ["VBA", "trae macros"], ["Macros", "trae macros"], ["ObjectPool", "trae objetos incrustados"]];
  for (const [texto, motivo] of marcas) {
    if (buf.includes(Buffer.from(texto, "utf16le")) || (texto !== "VBA" && buf.includes(Buffer.from(texto, "latin1")))) throw rechazo(nombre, motivo);
  }
}

function revisarCsv(buf, nombre) {
  const muestra = buf.slice(0, 2 * 1024 * 1024);
  if (muestra.includes(0)) throw rechazo(nombre, "no es un archivo de texto");
  const texto = muestra.toString("utf8");
  if (/[\x01-\x08\x0b\x0c\x0e-\x1f]/.test(texto)) throw rechazo(nombre, "trae caracteres de control, no parece un CSV");
  for (const celda of texto.split(/[;,\t\r\n]/)) {
    const c = celda.replace(/^["'\s]+/, "");
    if (/^[=+\-@]/.test(c) && FORMULA_PELIGROSA.test(c)) throw rechazo(nombre, "trae fórmulas que podrían ejecutar comandos");
  }
}

// Fórmulas guardadas en las celdas del libro ya leído (xlsx y xls).
function revisarFormulas(wb, nombre) {
  for (const hoja of wb.SheetNames) {
    const s = wb.Sheets[hoja];
    for (const k of Object.keys(s)) {
      if (k[0] === "!") continue;
      const f = s[k]?.f;
      if (f && FORMULA_PELIGROSA.test(f)) throw rechazo(nombre, "trae fórmulas que podrían ejecutar comandos");
    }
  }
}

// Revisa el archivo y, si pasa, devuelve el libro ya leído. Lanza un 400 con el motivo (err.rechazado = true) si no.
export function revisarArchivoImportacion(buffer, nombre) {
  const ext = extension(nombre);
  if (!EXTENSIONES.includes(ext)) throw rechazo(nombre, "solo se aceptan Excel (.xlsx, .xls), CSV y fotos");
  if (!buffer?.length) throw rechazo(nombre, "está vacío");
  if (buffer.length > MAX_BYTES_ARCHIVO) throw rechazo(nombre, "pasa de 10 MB");
  const esZip = buffer.readUInt32LE(0) === 0x04034b50;
  const esOle = buffer.slice(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  if (ext === ".xlsx") {
    if (!esZip) throw rechazo(nombre, "dice ser Excel pero no lo es");
    revisarXlsx(buffer, nombre);
  } else if (ext === ".xls") {
    if (!esOle) throw rechazo(nombre, "dice ser Excel pero no lo es");
    revisarXls(buffer, nombre);
  } else {
    if (esZip || esOle) throw rechazo(nombre, "dice ser CSV pero no lo es");
    revisarCsv(buffer, nombre);
  }
  let wb;
  try {
    wb = ext === ".csv"
      ? XLSX.read(buffer.toString("utf8"), { type: "string", cellFormula: false })
      : XLSX.read(buffer, { type: "buffer", cellFormula: true, cellHTML: false });
  } catch {
    throw rechazo(nombre, "no se pudo abrir");
  }
  if (ext !== ".csv") revisarFormulas(wb, nombre);
  return wb;
}
