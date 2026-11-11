import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { logTesoreria } from "@/lib/audit";
import { mapasCatalogos } from "@/lib/tesoreria/maestros";
import { toClientPago } from "@/lib/tesoreria/pagos";
import { fmtMoneda, TIPOS_PAGO } from "@/lib/tesoreria/comun";

// Tablas dinámicas de Tesorería sobre los pagos programados, como las hojas del Excel:
//   «Ejecutado»          → Tipo → Ítem → Concepto, mes a mes.
//   «Por medio de pago»  → Medio de pago → Tipo → Ítem → Concepto, mes a mes.
// Valores con signo (egreso negativo, como en el Excel), sumados por el código; un árbol por moneda ISO 4217.
// Por defecto I, E y J (jornal), que son los que suman; con «todosLosTipos» entran también S y T.
// detallePivote devuelve los pagos de UNA celda (el doble clic de Excel) con la misma lógica.

const num = (d) => (d == null ? 0 : Number(d));
const ORDEN_TIPO = ["E", "I", "J", "T", "S"].map((t) => `${t} · ${TIPOS_PAGO[t]}`);
const cmp = (a, b) => a.localeCompare(b, "es", { sensitivity: "base" });

function nodo(nombre) {
  return { nombre, meses: Array(12).fill(0), total: 0, hijos: new Map() };
}
function sumar(n, mes, v) { n.meses[mes] += v; n.total += v; }
function aJson(n) {
  const hijos = [...n.hijos.values()];
  const sonTipos = hijos.every((h) => ORDEN_TIPO.includes(h.nombre));
  hijos.sort((a, b) => (sonTipos ? ORDEN_TIPO.indexOf(a.nombre) - ORDEN_TIPO.indexOf(b.nombre) : cmp(a.nombre, b.nombre)));
  return { nombre: n.nombre, meses: n.meses.map((v) => Math.round(v * 100) / 100), total: Math.round(n.total * 100) / 100, hijos: hijos.map(aJson) };
}

async function asientos({ anio, vista = "ejecutado", estado = "E", medioPagoId, pagadorId, itemId, tipo, mesDesde, mesHasta, todosLosTipos = false }) {
  anio = Number(anio) || new Date().getFullYear();
  const md = Math.min(Math.max(Number(mesDesde) || 1, 1), 12);
  const mh = Math.min(Math.max(Number(mesHasta) || 12, md), 12);
  const where = { anio, mes: { gte: md, lte: mh } };
  if (estado === "E" || estado === "P") where.estado = estado;
  if (medioPagoId) where.medioPagoId = Number(medioPagoId);
  if (pagadorId) where.pagadorId = Number(pagadorId);
  if (itemId) where.itemId = Number(itemId);
  if (tipo && TIPOS_PAGO[tipo]) where.tipo = tipo;
  else if (!todosLosTipos) where.tipo = { in: ["E", "I", "J"] };
  const [pagos, mapas] = await Promise.all([prisma.pagoProgramado.findMany({ where, include: { asociaciones: { select: { valor: true } } } }), mapasCatalogos()]);
  const out = pagos.map((p) => {
    const item = (p.itemId && mapas.items.get(p.itemId)?.nombre) || "Sin ítem";
    const concepto = mapas.conceptos.get(p.conceptoId)?.nombre || p.concepto;
    const tipoTxt = `${p.tipo} · ${TIPOS_PAGO[p.tipo]}`;
    const medio = (p.medioPagoId && mapas.medios.get(p.medioPagoId)?.nombre) || "Sin medio de pago";
    return { pago: p, mes: p.mes - 1, valor: num(p.valor), ruta: vista === "medio" ? [medio, tipoTxt, item, concepto] : [tipoTxt, item, concepto] };
  });
  return { anio, md, mh, pagos, mapas, asientos: out };
}

export async function pivote(params) {
  const vista = params.vista === "medio" ? "medio" : "ejecutado";
  const { anio, md, mh, pagos, asientos: lista } = await asientos({ ...params, vista });
  const raices = new Map();
  for (const a of lista) {
    if (!raices.has(a.pago.moneda)) raices.set(a.pago.moneda, nodo(a.pago.moneda));
    let n = raices.get(a.pago.moneda);
    sumar(n, a.mes, a.valor);
    for (const nombre of a.ruta) {
      if (!n.hijos.has(nombre)) n.hijos.set(nombre, nodo(nombre));
      n = n.hijos.get(nombre);
      sumar(n, a.mes, a.valor);
    }
  }
  const monedas = [...raices.keys()].sort((a, b) => (a === "COP" ? -1 : b === "COP" ? 1 : a.localeCompare(b)));
  return {
    anio, vista, estado: params.estado || "E", mesDesde: md, mesHasta: mh, todosLosTipos: !!params.todosLosTipos,
    niveles: vista === "medio" ? ["Medio de pago", "Tipo", "Ítem", "Concepto"] : ["Tipo", "Ítem", "Concepto"],
    porMoneda: monedas.map((moneda) => ({ moneda, ...aJson(raices.get(moneda)) })),
    pagos: pagos.length,
  };
}

export async function detallePivote(params, { moneda, ruta = [], mes = null, page = 1, size = 10 }) {
  const vista = params.vista === "medio" ? "medio" : "ejecutado";
  const { mapas, asientos: lista } = await asientos({ ...params, vista });
  const elegidos = lista.filter((a) => a.pago.moneda === moneda && (mes == null || a.mes === Number(mes)) && ruta.every((r, i) => a.ruta[i] === r));
  elegidos.sort((a, b) => b.pago.fecha.localeCompare(a.pago.fecha) || b.pago.id - a.pago.id);
  const total = elegidos.reduce((s, a) => s + a.valor, 0);
  size = [10, 25, 50, 100].includes(Number(size)) ? Number(size) : 10;
  const paginas = Math.max(1, Math.ceil(elegidos.length / size));
  page = Math.min(Math.max(1, Number(page) || 1), paginas);
  return {
    moneda, ruta, mes: mes == null ? null : Number(mes), total, totalTexto: fmtMoneda(total, moneda), cantidad: elegidos.length, page, size,
    items: elegidos.slice((page - 1) * size, page * size).map((a) => toClientPago(a.pago, mapas)),
  };
}

// Excel del año: las dos tablas dinámicas aplanadas (una fila por nodo, con su nivel).
export async function excelReportes(actor, anio, estado = "E") {
  const wb = XLSX.utils.book_new();
  const MES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  for (const [vista, hoja] of [["ejecutado", "Ejecutado"], ["medio", "Por medio de pago"]]) {
    const p = await pivote({ anio, vista, estado });
    const filas = [];
    const recorrer = (n, nivel) => {
      filas.push([`${"   ".repeat(nivel)}${n.nombre}`, ...n.meses, n.total]);
      for (const h of n.hijos) recorrer(h, nivel + 1);
    };
    for (const raiz of p.porMoneda) recorrer(raiz, 0);
    const ws = XLSX.utils.aoa_to_sheet([[p.niveles.join(" › "), ...MES, "Total"], ...filas]);
    ws["!cols"] = [{ wch: 48 }, ...MES.map(() => ({ wch: 14 })), { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, ws, hoja);
  }
  logTesoreria(actor, { action: "descargar", entityType: "pagoTesoreria", recordId: `reporte-${anio}`, recordInfo: `Reportes de Tesorería ${anio} en Excel` }).catch(() => {});
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}
