import { createHash } from "crypto";
import * as XLSX from "xlsx";

// Lectura de la plantilla «Flujo de Caja» (núcleo puro: solo paquetes, sin base de datos).
//   - Pestañas de BANCO: una por banco («Mvto Banco Andino», «Mvto Pacificorp»…). Columnas reconocidas por su título:
//     fecha, tipo de transacción (débito/crédito), descripción, valor, concepto, nombre (tercero), observación, tipo de
//     carga, tipo de solicitud, preparador, formato, mes, año. El signo sale del tipo de transacción; si no hay, del
//     FORMATO (incremento, rendimientos… entran); si no, del signo del valor. Las filas SALDO INICIAL/FINAL son saldos
//     reportados por el banco, no movimientos. Filas sin fecha ni tipo (resúmenes al final) se ignoran.
//   - Pestañas de PAGOS («Detalle 2026»): Ítem, INGRESO/EGRESO (I ingreso, E egreso, J jornal, S saldo, T traslado), ESTADO (P/E), Concepto, Medio de pago,
//     Paga, Año, Mes, Valor (egreso negativo). Un valor «-» o vacío se carga en 0 (y queda alerta).
// Cada pestaña se clasifica con una certeza: «seguro» se preselecciona; «dudoso» se le pregunta a la persona.

export const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
export const texto = (s) => (s == null ? "" : String(s).replace(/�/g, "").replace(/\s+/g, " ").trim());
const sha1 = (s) => createHash("sha1").update(s).digest("hex");

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export function fechaDeCelda(v) {
  if (v == null || v === "") return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000);
    if (Number.isNaN(d.getTime()) || d.getUTCFullYear() < 2000 || d.getUTCFullYear() > 2100) return null;
    return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return Number(m[1]) >= 2000 ? `${m[1]}-${m[2]}-${m[3]}` : null;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(\s+\d{1,2}:\d{2}(:\d{2})?\s*([ap]\.?\s?m\.?)?)?$/i); // dd/mm/aaaa [hh:mm[:ss] AM]
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    const mes = Number(m[2]);
    const dia = Number(m[1]);
    if (mes < 1 || mes > 12 || dia < 1 || dia > 31 || Number(y) < 2000) return null;
    return `${y}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  }
  return null;
}

export function valorDeCelda(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s0 = String(v ?? "").trim();
  if (!s0 || /^-+$/.test(s0)) return null;
  const negativo = /^\(.*\)$/.test(s0) || /^-/.test(s0);
  const s = s0.replace(/[^\d,.]/g, "");
  if (!s) return null;
  const n = s.includes(",") && s.lastIndexOf(",") > s.lastIndexOf(".") ? Number(s.replace(/\./g, "").replace(",", ".")) : Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? (negativo ? -n : n) : null;
}

const mesDeCelda = (v) => {
  if (typeof v === "number" && v >= 1 && v <= 12) return Math.trunc(v);
  const s = norm(v);
  const n = Number(s);
  if (Number.isInteger(n) && n >= 1 && n <= 12) return n;
  const i = MESES.findIndex((m) => s.startsWith(m.slice(0, 4)));
  return i >= 0 ? i + 1 : null;
};
const anioDeCelda = (v) => {
  const n = typeof v === "number" ? Math.trunc(v) : Number(String(v ?? "").replace(/[^\d]/g, ""));
  return n >= 2000 && n <= 2100 ? n : null;
};

// ---------- Reconocer columnas ----------

const ALIAS_BANCO = {
  fecha: [/^fecha( carga| transaccion| movimiento)?$/],
  tipo: [/^tipo de transaccion$/, /^tipo transaccion$/, /^debito ?\/ ?credito$/, /^naturaleza$/],
  descripcion: [/^descripcion$/, /^detalle$/],
  valor: [/^valor$/, /^monto$/, /^importe$/],
  concepto: [/^concepto$/],
  tercero: [/^nombre$/, /^tercero$/, /^beneficiario$/],
  observacion: [/^observacion(es)?$/],
  tipoCarga: [/^tipo de carga$/],
  tipoSolicitud: [/^tipo (de )?solicitud$/],
  preparador: [/^preparador$/],
  formato: [/^formato$/],
  mes: [/^mes$/],
  anio: [/^ano$/, /^anio$/],
  referencia: [/^referencia$/, /^comprobante$/],
};
const ALIAS_PAGOS = {
  item: [/^item$/, /^categoria$/],
  tipo: [/^ingreso ?\/ ?egreso$/, /^tipo$/],
  estado: [/^estado$/],
  concepto: [/^concepto$/],
  medio: [/^medio de pago$/],
  paga: [/^paga$/, /^quien paga$/],
  anio: [/^ano$/, /^anio$/],
  mes: [/^mes$/],
  valor: [/^valor$/],
  observacion: [/^observacion(es)?$/],
};

function columnas(cabecera, alias) {
  const cab = cabecera.map((c) => norm(c));
  const idx = {};
  for (const [k, lista] of Object.entries(alias)) {
    const j = cab.findIndex((c, i) => c && !Object.values(idx).includes(i) && lista.some((re) => re.test(c)));
    if (j >= 0) idx[k] = j;
  }
  return idx;
}

function filasDe(ws) {
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true });
}

// Clasifica una hoja: { tipo: "banco" | "pagos" | null, certeza, cabecera, idx, motivo }.
function clasificar(filas) {
  let mejor = null;
  for (let i = 0; i < Math.min(filas.length, 15); i++) {
    const fila = filas[i] || [];
    if (fila.filter((c) => c != null && String(c).trim()).length < 3) continue;
    const p = columnas(fila, ALIAS_PAGOS);
    if (p.concepto !== undefined && p.valor !== undefined && p.mes !== undefined && p.anio !== undefined && p.estado !== undefined) {
      const seguro = p.tipo !== undefined && p.item !== undefined;
      const cand = { tipo: "pagos", certeza: seguro ? "seguro" : "dudoso", filaCabecera: i, idx: p, motivo: seguro ? "Tiene Ítem, INGRESO/EGRESO, Estado, Concepto, Año, Mes y Valor." : "Parece de pagos programados pero le faltan columnas (Ítem o INGRESO/EGRESO): el tipo se toma del signo del valor." };
      if (!mejor || (seguro && mejor.certeza !== "seguro")) mejor = cand;
      if (seguro) break;
    }
    const b = columnas(fila, ALIAS_BANCO);
    if (b.fecha !== undefined && b.valor !== undefined && (b.tipo !== undefined || b.formato !== undefined || b.descripcion !== undefined)) {
      const seguro = b.tipo !== undefined || b.formato !== undefined;
      const cand = { tipo: "banco", certeza: seguro ? "seguro" : "dudoso", filaCabecera: i, idx: b, motivo: seguro ? "Tiene fecha, valor y el tipo de transacción o el formato del banco." : "Tiene fecha, descripción y valor, pero no dice si cada fila entra o sale: ¿es una pestaña de banco?" };
      if (!mejor || (seguro && mejor.certeza !== "seguro")) mejor = cand;
    }
  }
  return mejor;
}

// «Mvto Banco Andino » → «Banco Andino»
export function bancoSugerido(nombreHoja) {
  const s = texto(nombreHoja).replace(/^(mvto|mvtos|mov|movs|movimientos?|extracto)\.?\s+(de\s+)?/i, "").trim();
  return s || texto(nombreHoja);
}

// ---------- Leer filas ----------

const ENTRADAS = /^(incremento|imcremento|rendimiento|redimiento|reintegro|ingreso|abono|consignacion|deposito|traslado desde)/;

export function leerBanco(filas, clasif) {
  const { idx, filaCabecera } = clasif;
  const out = { movimientos: [], saldos: [], ignoradas: 0, problemas: [] };
  const cel = (f, k) => (idx[k] === undefined ? null : f[idx[k]]);
  let ultimoAnio = null;
  for (let i = filaCabecera + 1; i < filas.length; i++) {
    const f = filas[i] || [];
    const nFila = i + 1; // como la ve la persona en Excel
    const tipoTxt = norm(cel(f, "tipo"));
    const formato = texto(cel(f, "formato"));
    const fechaRaw = cel(f, "fecha");
    let fecha = fechaDeCelda(fechaRaw);
    const v = valorDeCelda(cel(f, "valor"));
    const descripcion = texto(cel(f, "descripcion")) || formato;
    const tieneDatos = fechaRaw != null || tipoTxt || formato;
    if (!tieneDatos) { if (f.some((c) => c != null && String(c).trim())) out.ignoradas++; continue; }
    const mesCol = mesDeCelda(cel(f, "mes"));
    const anioCol = anioDeCelda(cel(f, "anio"));
    // Una fecha a más de un año de las filas vecinas (o del año de la columna Año) está dañada: se toma el mes.
    if (fecha) {
      const y = Number(fecha.slice(0, 4));
      const ref = anioCol || ultimoAnio;
      if (ref && Math.abs(y - ref) > 1) fecha = null;
      else ultimoAnio = y;
    }
    let aproximada = false;
    if (!fecha && mesCol && (anioCol || ultimoAnio)) {
      fecha = `${anioCol || ultimoAnio}-${String(mesCol).padStart(2, "0")}-01`;
      aproximada = true;
    }
    // Saldos reportados por el banco (SALDO INICIAL ENERO, SALDO FINAL…).
    const textoSaldo = /^saldo/i.test(norm(formato)) ? formato : /^saldo/i.test(norm(descripcion)) ? descripcion : null;
    if (textoSaldo) {
      const mesTxt = MESES.findIndex((m) => norm(textoSaldo).includes(m.slice(0, 5)));
      const mes = mesCol || (mesTxt >= 0 ? mesTxt + 1 : fecha ? Number(fecha.slice(5, 7)) : null);
      const anio = anioCol || ultimoAnio || (fecha ? Number(fecha.slice(0, 4)) : null);
      if (v != null && mes && anio) out.saldos.push({ fila: nFila, anio, mes, tipo: /inic|incal/.test(norm(textoSaldo)) ? "inicial" : "final", valor: v, texto: textoSaldo });
      else out.ignoradas++;
      continue;
    }
    if (!fecha) { out.problemas.push({ fila: nFila, motivo: "sin fecha válida ni mes", texto: descripcion }); continue; }
    if (v == null || v === 0) { out.problemas.push({ fila: nFila, motivo: "sin valor", texto: descripcion, fecha }); continue; }
    let tipo;
    if (tipoTxt) tipo = /cred|abono|ingreso/.test(tipoTxt) ? "credito" : "debito";
    else if (formato) tipo = ENTRADAS.test(norm(formato)) ? "credito" : "debito";
    else tipo = v < 0 ? "debito" : "credito";
    // Un valor negativo con tipo o formato es un reverso: va en el sentido contrario (un «Crédito» de −165 sale).
    if ((tipoTxt || formato) && v < 0) tipo = tipo === "credito" ? "debito" : "credito";
    out.movimientos.push({
      fila: nFila, tipo, fecha, fechaAproximada: aproximada, valor: Math.abs(v), descripcion: descripcion || "(sin descripción)",
      concepto: texto(cel(f, "concepto")) || null, tercero: texto(cel(f, "tercero")) || null, observacion: texto(cel(f, "observacion")) || null,
      referencia: texto(cel(f, "referencia")) || null, tipoCarga: texto(cel(f, "tipoCarga")) || null, tipoSolicitud: texto(cel(f, "tipoSolicitud")) || null,
      preparador: texto(cel(f, "preparador")) || null, formato: formato || null,
      fechaOriginal: aproximada ? texto(fechaRaw) : null,
    });
  }
  return out;
}

export function leerPagos(filas, clasif) {
  const { idx, filaCabecera } = clasif;
  const cel = (f, k) => (idx[k] === undefined ? null : f[idx[k]]);
  const out = { pagos: [], ignoradas: 0, problemas: [] };
  for (let i = filaCabecera + 1; i < filas.length; i++) {
    const f = filas[i] || [];
    const nFila = i + 1;
    const concepto = texto(cel(f, "concepto"));
    const anio = anioDeCelda(cel(f, "anio"));
    const mes = mesDeCelda(cel(f, "mes"));
    if (!concepto && !anio && !mes) { if (f.some((c) => c != null && String(c).trim())) out.ignoradas++; continue; }
    if (!concepto || !anio || !mes) { out.problemas.push({ fila: nFila, motivo: !concepto ? "sin concepto" : "sin año o mes", texto: concepto || texto(cel(f, "item")) }); continue; }
    const vRaw = cel(f, "valor");
    const v = valorDeCelda(vRaw);
    let tipo = texto(cel(f, "tipo")).toUpperCase();
    if (!["I", "E", "J", "S", "T"].includes(tipo)) tipo = v != null && v > 0 ? "I" : "E";
    const est = texto(cel(f, "estado")).toUpperCase();
    out.pagos.push({
      fila: nFila, anio, mes, tipo, estado: est === "E" ? "E" : "P", item: texto(cel(f, "item")) || null, concepto,
      medio: texto(cel(f, "medio")) || null, paga: texto(cel(f, "paga")) || null,
      valor: v == null ? 0 : v, valorVacio: v == null || v === 0, observacion: texto(cel(f, "observacion")) || null,
    });
  }
  return out;
}

// ---------- Huellas (volver a subir la plantilla no duplica) ----------

// Movimiento: banco + fecha + tipo + valor + descripción + cuántos iguales van antes en la misma hoja.
export function clavesMovimientos(bancoId, movimientos) {
  const vistas = new Map();
  return movimientos.map((m) => {
    const base = `${bancoId}|${m.fecha}|${m.tipo}|${Math.round(m.valor * 100)}|${norm(m.descripcion)}`;
    const n = (vistas.get(base) || 0) + 1;
    vistas.set(base, n);
    return { ...m, clave: sha1(`mov|${base}|${n}`) };
  });
}

// Pago: año + mes + tipo + ítem + concepto + medio + paga (sin estado ni valor: si en la nueva plantilla el pago pasó
// de P a E o cambió el valor, se reconoce como el mismo).
export function clavesPagos(pagos) {
  const vistas = new Map();
  return pagos.map((p) => {
    const base = `${p.anio}|${p.mes}|${p.tipo}|${norm(p.item)}|${norm(p.concepto)}|${norm(p.medio)}|${norm(p.paga)}`;
    const n = (vistas.get(base) || 0) + 1;
    vistas.set(base, n);
    return { ...p, clave: sha1(`pago|${base}|${n}`) };
  });
}

export const claveGrupo = (p) => `${p.tipo}|${norm(p.item)}|${norm(p.concepto)}|${norm(p.medio)}|${norm(p.paga)}`;

// ---------- Gastos periódicos inferidos ----------
// Lo que se repite en 3 o más meses del año (mismo tipo, ítem, concepto, medio y quién paga) se propone como gasto
// periódico; la periodicidad sale de la distancia típica entre meses (dos filas por mes = quincenal). La persona
// confirma la periodicidad y el día de corte. Los saldos (S) nunca son periódicos.
export function inferirPeriodicos(pagos) {
  const grupos = new Map();
  for (const p of pagos) {
    if (p.tipo === "S") continue;
    const k = claveGrupo(p);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(p);
  }
  const out = [];
  for (const [clave, lista] of grupos) {
    const anios = [...new Set(lista.map((p) => p.anio))];
    if (anios.length !== 1) continue; // un gasto por año de plantilla
    const meses = [...new Set(lista.map((p) => p.mes))].sort((a, b) => a - b);
    if (meses.length < 3) continue;
    const porMes = lista.length / meses.length;
    const saltos = meses.slice(1).map((m, i) => m - meses[i]).sort((a, b) => a - b);
    const salto = saltos[Math.floor(saltos.length / 2)] || 1;
    const periodicidad = porMes >= 1.8 ? "quincenal" : salto >= 12 ? "anual" : salto >= 6 ? "semestral" : salto >= 3 ? "trimestral" : salto >= 2 ? "bimestral" : "mensual";
    const ordenados = [...lista].sort((a, b) => a.mes - b.mes || a.fila - b.fila);
    const pagados = ordenados.filter((p) => p.estado === "E" && p.valor !== 0);
    const ref = pagados.at(-1) || ordenados.filter((p) => p.valor !== 0).at(-1) || ordenados.at(-1);
    const p0 = ordenados[0];
    out.push({
      clave, tipo: p0.tipo, item: p0.item, concepto: p0.concepto, medio: p0.medio, paga: p0.paga, anio: anios[0],
      meses, filas: lista.length, periodicidad, valor: ref.valor, mesInicio: meses[0], pagados: pagados.length, pendientes: lista.filter((p) => p.estado === "P").length,
    });
  }
  return out.sort((a, b) => b.filas - a.filas || norm(a.concepto).localeCompare(norm(b.concepto)));
}

// ---------- Analizar el libro completo ----------

export function analizarLibro(buffer) {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: false, raw: true });
  const hojas = [];
  for (const nombre of wb.SheetNames) {
    const filas = filasDe(wb.Sheets[nombre]);
    const c = clasificar(filas);
    const h = { nombre, filas: filas.length, tipo: c?.tipo || null, certeza: c?.certeza || null, motivo: c?.motivo || "No tiene las columnas de una pestaña de banco ni de pagos programados." };
    if (c) {
      h.columnas = Object.fromEntries(Object.entries(c.idx).map(([k, j]) => [k, texto((filas[c.filaCabecera] || [])[j])]));
      h._clasif = c;
      h._filas = filas;
    }
    hojas.push(h);
  }
  return hojas;
}
