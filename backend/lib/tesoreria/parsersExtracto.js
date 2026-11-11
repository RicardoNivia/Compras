import { createHash } from "crypto";
import * as XLSX from "xlsx";

// Lectura de extractos bancarios (núcleo puro: solo imports de paquetes, lo usan la app y
// scripts/tesoreria/importarFlujoCaja.mjs). Devuelve líneas { fecha, descripcion, tercero, valor (con signo), etiqueta,
// clave }. Formatos:
//   avvillas  — «Tipo de Transacción | Fecha | Descripción | Valor | Concepto» (Débito/Crédito; valor sin signo).
//   credicorp — exportación del portal: «FECHA CARGA | FORMATO | VALOR | NOMBRE | OBSERVACIÓN»; el signo sale del
//               FORMATO y las filas SALDO INICIAL/FINAL no son movimientos.
//   generico  — cualquier Excel/CSV con columnas de fecha, descripción y valor (o débito y crédito); si trae una columna de
//               tipo de movimiento («Plata que salió / entró», «Débito / Crédito») el signo sale de ahí.

const norm = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const texto = (s) => (s == null ? "" : String(s).replace(/\uFFFD/g, "").replace(/\s+/g, " ").trim());

export function fechaDeCelda(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    // Número de serie de Excel: días desde el 30/12/1899 (la parte decimal es la hora).
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000);
    if (Number.isNaN(d.getTime()) || d.getUTCFullYear() < 2000) return null;
    return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return Number(m[1]) >= 2000 ? `${m[1]}-${m[2]}-${m[3]}` : null;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/); // dd/mm/aaaa (formato colombiano)
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

export function valorDeCelda(v) {
  if (typeof v === "number") return v;
  const s = String(v ?? "").replace(/[^\d,.-]/g, "");
  if (!s) return null;
  // es-CO: 1.234.567,89 → 1234567.89 ; 1234567.89 se respeta
  const n = s.includes(",") ? Number(s.replace(/\./g, "").replace(",", ".")) : Number(/\.\d{3}(\D|$)/.test(s) ? s.replace(/\./g, "") : s);
  return Number.isFinite(n) ? n : null;
}

// Filas como arreglos; encuentra la fila de encabezados que tenga todas las columnas pedidas.
function tabla(wb, requeridas) {
  for (const nombre of wb.SheetNames) {
    const filas = XLSX.utils.sheet_to_json(wb.Sheets[nombre], { header: 1, raw: true, defval: null, blankrows: false });
    for (let i = 0; i < Math.min(filas.length, 30); i++) {
      const cab = (filas[i] || []).map(norm);
      const idx = {};
      for (const [k, alias] of Object.entries(requeridas)) {
        const j = cab.findIndex((c) => alias.some((a) => (a instanceof RegExp ? a.test(c) : c === a)));
        if (j >= 0) idx[k] = j;
      }
      const obligatorias = Object.entries(requeridas).filter(([k]) => !k.startsWith("_")).map(([k]) => k);
      if (obligatorias.every((k) => idx[k] !== undefined)) return { hoja: nombre, idx, filas: filas.slice(i + 1) };
    }
  }
  return null;
}

const ENTRADAS_CREDICORP = /^(incremento|imcremento|rendimientos|redimientos|reintegro gmf|ingreso|incremento por rechazo|abono|consignacion)/;

function leerAvVillas(wb) {
  const t = tabla(wb, { tipo: ["tipo de transaccion"], fecha: ["fecha"], desc: ["descripcion"], valor: ["valor"], _etiqueta: ["concepto"], _saldo: [/^saldo/] });
  if (!t) return null;
  return t.filas.map((f) => {
    const fecha = fechaDeCelda(f[t.idx.fecha]);
    const v = valorDeCelda(f[t.idx.valor]);
    if (!fecha || v == null) return null;
    let credito = /cred/.test(norm(f[t.idx.tipo]));
    if (v < 0) credito = !credito; // un «Crédito» negativo es un reverso: sale
    const saldo = t.idx._saldo !== undefined ? valorDeCelda(f[t.idx._saldo]) : null;
    return { fecha, descripcion: texto(f[t.idx.desc]), tercero: null, valor: credito ? Math.abs(v) : -Math.abs(v), etiqueta: texto(f[t.idx._etiqueta]) || null, saldo };
  }).filter(Boolean);
}

function leerCredicorp(wb) {
  const t = tabla(wb, { fecha: ["fecha carga", "fecha"], formato: ["formato"], valor: ["valor"], _nombre: ["nombre"], _obs: [/^observaci/] });
  if (!t) return null;
  const saldos = [];
  const lineas = t.filas.map((f) => {
    const formato = texto(f[t.idx.formato]);
    if (/^saldo/i.test(norm(formato))) { // saldos: no son movimientos, pero sirven para cuadrar
      const sv = valorDeCelda(f[t.idx.valor]);
      if (sv != null) saldos.push({ tipo: /inic|incal/.test(norm(formato)) ? "inicial" : "final", valor: sv });
      return null;
    }
    if (!formato) return null;
    const fecha = fechaDeCelda(f[t.idx.fecha]);
    const v = valorDeCelda(f[t.idx.valor]);
    if (!fecha || v == null || v === 0) return null;
    const entra = ENTRADAS_CREDICORP.test(norm(formato));
    return { fecha, descripcion: formato, tercero: texto(f[t.idx._nombre]) || null, valor: entra ? Math.abs(v) : -Math.abs(v), etiqueta: texto(f[t.idx._obs]) || null };
  }).filter(Boolean);
  lineas.saldoInicial = saldos.find((x) => x.tipo === "inicial")?.valor ?? null;
  lineas.saldoFinal = [...saldos].reverse().find((x) => x.tipo === "final")?.valor ?? null;
  return lineas;
}

function leerGenerico(wb) {
  const t = tabla(wb, { fecha: [/^fecha/], desc: [/^descripci/, /^concepto/, /^detalle/], _valor: [/^valor/, /^monto/, /^importe/], _debito: [/^debito/, /^cargo/, /^retiro/], _credito: [/^credito/, /^abono/, /^deposito/], _saldo: [/^saldo/], _tipo: [/^tipo de movimiento/, /^tipo de transaccion/, /^naturaleza/, /^movimiento$/] });
  if (!t || (t.idx._valor === undefined && t.idx._debito === undefined)) return null;
  return t.filas.map((f) => {
    const fecha = fechaDeCelda(f[t.idx.fecha]);
    let v = t.idx._valor !== undefined ? valorDeCelda(f[t.idx._valor]) : null;
    if (v == null) {
      const deb = valorDeCelda(f[t.idx._debito]) || 0;
      const cre = t.idx._credito !== undefined ? valorDeCelda(f[t.idx._credito]) || 0 : 0;
      v = cre - Math.abs(deb);
    }
    if (!fecha || !v) return null;
    // Columna de tipo («Plata que salió / Plata que entró», «Débito / Crédito»…): da el signo cuando el valor viene positivo.
    if (t.idx._tipo !== undefined) {
      const tt = norm(f[t.idx._tipo]);
      if (/sal|deb|cargo|retiro|egres|pago/.test(tt)) v = -Math.abs(v);
      else if (/entr|cred|abono|ingres|deposit|consign/.test(tt)) v = Math.abs(v);
    }
    const saldo = t.idx._saldo !== undefined ? valorDeCelda(f[t.idx._saldo]) : null;
    return { fecha, descripcion: texto(f[t.idx.desc]), tercero: null, valor: v, etiqueta: null, saldo };
  }).filter(Boolean);
}

// Huella de cada línea: fecha + descripción + valor + cuántas iguales van antes en el mismo archivo (dos cargos idénticos
// el mismo día son dos líneas). Volver a importar el mismo extracto no duplica nada.
export function conClaves(lineas) {
  const vistas = new Map();
  return lineas.map((l) => {
    const base = `${l.fecha}|${norm(l.descripcion)}|${norm(l.tercero)}|${Math.round(l.valor * 100)}`;
    const n = (vistas.get(base) || 0) + 1;
    vistas.set(base, n);
    return { ...l, clave: createHash("sha1").update(`${base}|${n}`).digest("hex") };
  });
}

// Saldo inicial y final del extracto: los de las filas SALDO si las trae; si no, de la columna de saldo (el inicial es el
// primer saldo menos su movimiento). Si el archivo viene del más nuevo al más viejo, se lee al revés.
function saldosDe(lineas) {
  if (lineas.saldoInicial != null || lineas.saldoFinal != null) return { saldoInicial: lineas.saldoInicial ?? null, saldoFinal: lineas.saldoFinal ?? null };
  const con = lineas.filter((l) => l.saldo != null);
  if (!con.length) return { saldoInicial: null, saldoFinal: null };
  const orden = con[0].fecha > con.at(-1).fecha ? [...con].reverse() : con;
  return { saldoInicial: Math.round((orden[0].saldo - orden[0].valor) * 100) / 100, saldoFinal: orden.at(-1).saldo };
}

export function leerExtracto(buffer, formato) {
  // Un CSV se lee como texto (raw): si no, el lector convierte «2026-10-31» en fecha con la zona horaria y la corre un día.
  const esLibro = (buffer[0] === 0x50 && buffer[1] === 0x4b) || (buffer[0] === 0xd0 && buffer[1] === 0xcf); // xlsx (zip) o xls
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: false, raw: !esLibro, ...(esLibro ? {} : { codepage: 65001 }) });
  const lectores = { avvillas: leerAvVillas, credicorp: leerCredicorp, generico: leerGenerico };
  const orden = formato && lectores[formato] ? [formato, ...Object.keys(lectores).filter((k) => k !== formato)] : Object.keys(lectores);
  for (const f of orden) {
    const lineas = lectores[f](wb);
    if (lineas?.length) return { formato: f, lineas: conClaves(lineas), ...saldosDe(lineas) };
  }
  return { formato: null, lineas: [], saldoInicial: null, saldoFinal: null };
}

// Patrón de una descripción bancaria para las reglas: sin números, referencias ni espacios de más.
export function patronDe(descripcion) {
  return norm(descripcion).replace(/[0-9]+/g, " ").replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim().split(" ").slice(0, 6).join(" ");
}
