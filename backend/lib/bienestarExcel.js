// "* as": xlsx es CommonJS y en el bundle de Next no trae export por defecto (en Node sí funcionaría con default).
import * as XLSX from "xlsx";

// Lectura de los Excel de Bienestar (exportaciones de Microsoft Forms y listas de asistencia): convierte cada fila en
// un participante { nombre, documento, area, correo, asistio, motivoInasistencia, calificacion, observacion, datos }.
// Las columnas se reconocen por su encabezado (no por posición, cada formulario es distinto); lo que no es un campo
// conocido queda en "datos" con su encabezado original. Solo imports de paquetes: lo usan la app y
// scripts/bienestar/importarParticipantes.mjs.

const sinTildes = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// Columnas de Microsoft Forms sin información útil (el correo es el del formulario, no el de la persona).
// La columna "Nombre" de Forms viene vacía: no se ignora, simplemente se toma el primer nombre con datos de la fila.
const IGNORAR = [/^id$/, /^hora de (inicio|finalizacion)$/, /^hora de la ultima modificacion$/, /^correo electronico$/, /^columna\d*$/, /^\(col \d+\)$/, /^n[°o]?$/, /^#$/, /^firma( de asistencia)?$/];

const CAMPOS = [
  // Planillas con nombres y apellidos en columnas separadas (se unen al final de la fila).
  { campo: "nombres", re: [/^nombres$/] },
  { campo: "apellidos", re: [/^apellidos$/] },
  { campo: "nombre", re: [/^nombre(s)? completo/, /^nombre colaborador$/, /^nombre completo colaborador$/, /^nombre y apellido/, /^colaborador$/, /^nombre$/] },
  { campo: "documento", re: [/documento/, /identificacion/, /cedula/] },
  { campo: "area", re: [/^(cual|cúal|¿cual|¿cúal) es tu area/, /area/, /departamento/] },
  { campo: "asistencia", re: [/^asistencia$/, /confirma tu asistencia/, /^estado$/, /^asistio/] },
  { campo: "calificacion", re: [/escala de 1 a 5/, /como calificarias/, /calificacion/] },
  { campo: "observacion", re: [/observaciones?/, /comentarios?/, /sugerencias/] },
];

const MOTIVOS = [
  [/incapacidad|enferm|salud|gripe|cirug|medic|accidente/, "Incapacidad médica"],
  [/laboral|reunion|trabajo|cliente|feria/, "Compromisos laborales"],
  [/calamidad/, "Calamidad familiar"],
  [/vacacion/, "Vacaciones"],
  [/viaje|fuera de bogota|traslado/, "Viaje"],
  [/personal/, "Motivos personales"],
  [/sin justific|no informo|sin informar/, "Sin justificación"],
];

// Los nombres no se escriben igual en todos los formularios ("Juan Pérez" en Forms, "JUAN CARLOS PEREZ GOMEZ" en la
// nómina): dos nombres son de la misma persona si comparten al menos dos palabras y el más corto está casi completo
// dentro del otro. Solo cuenta si hay UN candidato así (con dos o más, no se adivina).
const palabras = (s) => new Set(sinTildes(s).replace(/[^a-z\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !["del", "las", "los"].includes(w)));

export function buscarPorNombre(candidatos, nombre, clave = (c) => c.nombre) {
  const t = palabras(nombre);
  if (t.size < 2) return null;
  const hits = candidatos.filter((c) => {
    const o = palabras(clave(c));
    const comunes = [...t].filter((w) => o.has(w)).length;
    return comunes >= 2 && comunes >= Math.min(t.size, o.size) - 1;
  });
  return hits.length === 1 ? hits[0] : null;
}

export function normalizarDocumento(v) {
  const s = String(v ?? "").replace(/[.\s,-]/g, "").trim();
  return /^\d{5,15}$/.test(s) ? s : null;
}

// "X", "SI", "OK", "Asistió" → true; "NO", "No asiste por…" → false (con el motivo); vacío → null.
export function leerAsistencia(v) {
  const s = sinTildes(v);
  if (!s) return { asistio: null, motivo: null };
  if (/^(x|si|sí|ok|asistio|asiste|1|true|llega)/.test(s) || /llega a la fundacion/.test(s)) return { asistio: true, motivo: null };
  if (/^(no|0|false)/.test(s) || /no (puede )?asist|no asiste|no fue/.test(s)) {
    // "No asiste" a secas no dice por qué: queda sin motivo. Si trae algo más que no se reconoce, "Otro".
    const resto = s.replace(/no (puede |pudo )?asist[a-z]*|no fue|^no|[-–:.,]/g, "").trim();
    const motivo = MOTIVOS.find(([re]) => re.test(s))?.[1] || (resto.length > 3 ? "Otro" : null);
    return { asistio: false, motivo };
  }
  return { asistio: null, motivo: null };
}

export function campoDe(encabezado) {
  const h = sinTildes(encabezado).replace(/\s+/g, " ");
  if (!h || IGNORAR.some((re) => re.test(h))) return null;
  for (const c of CAMPOS) if (c.re.some((re) => re.test(h))) return c.campo;
  return "extra";
}

// Hoja con más filas de personas (la que tiene una columna de nombre); encabezado = primera fila con 3+ textos.
// Con "soloHoja" se usa esa hoja (archivos con inscripción y asistencia en hojas distintas).
function mejorHoja(wb, soloHoja) {
  let mejor = null;
  for (const nombre of wb.SheetNames.filter((n) => !soloHoja || n === soloHoja)) {
    const filas = XLSX.utils.sheet_to_json(wb.Sheets[nombre], { header: 1, raw: false, defval: "" });
    const hdr = filas.findIndex((r) => r.filter((c) => String(c).trim() && isNaN(Number(c))).length >= 3);
    if (hdr < 0) continue;
    const tieneNombre = filas[hdr].some((h) => campoDe(h) === "nombre");
    const n = filas.length - hdr - 1;
    if (tieneNombre && (!mejor || n > mejor.n)) mejor = { nombre, filas, hdr, n };
  }
  return mejor;
}

// buffer: el archivo .xlsx. Devuelve { hoja, columnas: [{ encabezado, campo }], participantes: [...] }.
export function leerParticipantesExcel(buffer, { hoja: soloHoja } = {}) {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const hoja = mejorHoja(wb, soloHoja);
  if (!hoja) {
    const err = new Error("No encontré en el archivo una hoja con una columna de nombres (por ejemplo \"Nombre completo\").");
    err.status = 400;
    throw err;
  }
  const encabezados = hoja.filas[hoja.hdr].map((h) => String(h ?? "").trim());
  const columnas = encabezados.map((encabezado, i) => ({ i, encabezado, campo: campoDe(encabezado) }));
  // Si hay varias columnas de nombre, la primera que tenga datos.
  const usadas = new Set();
  const participantes = [];
  for (const fila of hoja.filas.slice(hoja.hdr + 1)) {
    if (!fila.some((c) => String(c ?? "").trim())) continue;
    const p = { nombre: null, documento: null, area: null, correo: null, asistio: null, motivoInasistencia: null, calificacion: null, observacion: null, datos: {} };
    const observaciones = [];
    for (const col of columnas) {
      const v = String(fila[col.i] ?? "").trim();
      if (!v || !col.campo) continue;
      if (col.campo === "nombres") p._nombres = v;
      else if (col.campo === "apellidos") p._apellidos = v;
      else if (col.campo === "nombre" && !p.nombre) p.nombre = v.replace(/\s+/g, " ");
      else if (col.campo === "documento" && !p.documento) p.documento = normalizarDocumento(v);
      else if (col.campo === "area" && !p.area) p.area = v.replace(/\s+/g, " ").toUpperCase();
      else if (col.campo === "asistencia") {
        const a = leerAsistencia(v);
        if (a.asistio !== null) { p.asistio = a.asistio; p.motivoInasistencia = a.motivo; }
        if (a.asistio === false && v.length > 3) observaciones.push(v);
      } else if (col.campo === "calificacion") {
        const n = Math.round(Number(v));
        if (n >= 1 && n <= 5) p.calificacion = n;
      } else if (col.campo === "observacion") {
        if (!/^(n\/?a|ninguna?o?|ok|\.|:\)|gracias\.?|no)$/i.test(v)) observaciones.push(v);
        // Una observación tipo "No asiste – incapacidad" también marca la inasistencia.
        if (p.asistio === null && /no (puede )?asist|no asiste/i.test(v)) {
          const a = leerAsistencia(v);
          p.asistio = false;
          p.motivoInasistencia = a.motivo;
        }
      } else if (col.campo === "extra" || col.campo === "nombre" || col.campo === "documento" || col.campo === "area") {
        if (col.campo !== "extra") continue;
        p.datos[col.encabezado.replace(/\s+/g, " ").slice(0, 120)] = v.slice(0, 500);
      }
      usadas.add(col.i);
    }
    if (!p.nombre && p._nombres) p.nombre = `${p._nombres} ${p._apellidos || ""}`.replace(/\s+/g, " ").trim();
    delete p._nombres;
    delete p._apellidos;
    if (!p.nombre) continue;
    p.observacion = observaciones.join(" · ").slice(0, 1000) || null;
    participantes.push(p);
  }
  return {
    hoja: hoja.nombre,
    columnas: columnas.filter((c) => c.campo && usadas.has(c.i)).map(({ encabezado, campo }) => ({ encabezado, campo })),
    participantes,
  };
}

// Inventario: columnas ítem/producto/descripción, cantidad, unidad, costo/valor unitario, usado/consumido.
export function leerInventarioExcel(buffer) {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const filas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: "" });
  const hdr = filas.findIndex((r) => r.some((c) => /item|ítem|producto|insumo|descrip|articulo|artículo/i.test(String(c))));
  if (hdr < 0) {
    const err = new Error("El archivo de inventario necesita una columna \"Ítem\" (o Producto / Descripción) y una de \"Cantidad\".");
    err.status = 400;
    throw err;
  }
  const h = filas[hdr].map((c) => sinTildes(c));
  const col = (re) => h.findIndex((x) => re.test(x));
  const iItem = col(/item|producto|insumo|descrip|articulo/);
  const iCant = col(/^cant|cantidad/);
  const iUni = col(/unidad|medida/);
  const iCosto = col(/costo|valor|precio/);
  const iUsado = col(/usad|consum|gastad|entregad/);
  const num = (v) => {
    if (v === "" || v == null) return null;
    const n = typeof v === "number" ? v : Number(String(v).replace(/[$\s.]/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  };
  return filas.slice(hdr + 1)
    .filter((r) => String(r[iItem] ?? "").trim())
    .map((r) => ({
      item: String(r[iItem]).trim().slice(0, 200),
      cantidad: num(r[iCant]) ?? 0,
      unidad: iUni >= 0 ? String(r[iUni] ?? "").trim().slice(0, 40) || null : null,
      costoUnitario: iCosto >= 0 ? num(r[iCosto]) : null,
      usado: iUsado >= 0 ? num(r[iUsado]) : null,
    }));
}
