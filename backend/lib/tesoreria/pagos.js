import { prisma } from "@/lib/prisma";
import { idsQueCoinciden } from "@/lib/buscarTexto";
import { publicarPagoPagado, publicarMovimientosRegistrados } from "@/lib/tesoreria/eventos";
import { logTesoreria } from "@/lib/audit";
import { hoyColombia } from "@/lib/hoyColombia";
import { mapasCatalogos } from "@/lib/tesoreria/maestros";
import { asignadoDe } from "@/lib/tesoreria/asociaciones";
import {
  badRequest, notFound, limpiar, numero, fechaValida, fmtMoneda, redondear, valorConSigno,
  TIPOS_PAGO, TIPOS_QUE_SUMAN, ESTADOS_PAGO, PERIODICIDADES, esIngreso, esEgreso,
} from "@/lib/tesoreria/comun";

// Pagos programados (lo que en el Excel es «Detalle 2026»): una fila por pago y mes, con su estado P (pendiente) o E
// (pagado). Nacen de un gasto periódico, a mano (extraordinarios), de la plantilla o de una propuesta de Nova que la
// persona aprobó. El valor lleva el signo del Excel (egreso negativo). Diferencia = lo programado − lo asociado.
// Suman I, E y J (jornal, según su signo); S y T no.

const num = (d) => (d == null ? 0 : Number(d));
const TAMANOS = [10, 25, 50, 100];

export function toClientPago(p, mapas) {
  const valor = num(p.valor);
  const asignado = asignadoDe(p.asociaciones);
  const tieneMovs = (p.asociaciones?.length || 0) > 0;
  const diferencia = tieneMovs ? redondear(Math.abs(valor) - asignado) : null;
  return {
    id: p.id,
    anio: p.anio,
    mes: p.mes,
    fecha: p.fecha,
    fechaAproximada: p.fechaAproximada,
    tipo: p.tipo,
    tipoTexto: TIPOS_PAGO[p.tipo] || p.tipo,
    estado: p.estado,
    estadoTexto: ESTADOS_PAGO[p.estado] || p.estado,
    estadoPor: p.estadoPor,
    itemId: p.itemId,
    item: p.itemId ? mapas.items.get(p.itemId)?.nombre || "—" : null,
    conceptoId: p.conceptoId,
    concepto: mapas.conceptos.get(p.conceptoId)?.nombre || p.concepto,
    medioPagoId: p.medioPagoId,
    medioPago: p.medioPagoId ? mapas.medios.get(p.medioPagoId)?.nombre || "—" : null,
    pagadorId: p.pagadorId,
    pagador: p.pagadorId ? mapas.pagadores.get(p.pagadorId)?.nombre || "—" : null,
    valor,
    moneda: p.moneda,
    valorTexto: fmtMoneda(valor, p.moneda),
    movimientos: p.asociaciones?.length || 0,
    asignado,
    asignadoTexto: fmtMoneda(asignado, p.moneda),
    diferencia,
    diferenciaTexto: diferencia == null ? null : fmtMoneda(diferencia, p.moneda),
    gastoPeriodicoId: p.gastoPeriodicoId,
    periodicidad: p.gastoPeriodico ? PERIODICIDADES[p.gastoPeriodico.periodicidad] : null,
    periodo: p.periodo,
    origen: p.origen,
    observacion: p.observacion,
    createdAt: p.createdAt,
    creadoPorNombre: p.creadoPorNombre,
  };
}

async function whereDe(f) {
  const and = [];
  if (f.anio) and.push({ anio: Number(f.anio) });
  if (f.mes) and.push({ mes: Number(f.mes) });
  if (f.estado === "P" || f.estado === "E") and.push({ estado: f.estado });
  if (f.tipo && TIPOS_PAGO[f.tipo]) and.push({ tipo: f.tipo });
  for (const k of ["itemId", "conceptoId", "medioPagoId", "pagadorId", "gastoPeriodicoId"]) if (f[k]) and.push({ [k]: Number(f[k]) });
  if (f.origen) and.push({ origen: f.origen });
  if (f.extraordinarios === "1") and.push({ gastoPeriodicoId: null });
  if (f.vencidos === "1") and.push({ estado: "P", fecha: { lt: hoyColombia() } });
  if (f.ids) and.push({ id: { in: String(f.ids).split(",").map(Number).filter(Boolean) } });
  if (f.q) {
    const t = String(f.q).trim();
    and.push({ id: { in: await idsQueCoinciden("tesoreria_pagos_programados", ["concepto", "observacion"], t) } });
  }
  return and.length ? { AND: and } : {};
}

// Filtro por asociación (se calcula en memoria: depende de la suma de lo asociado).
function pasaAsociacion(p, filtro) {
  if (filtro === "sin") return p.movimientos === 0;
  if (filtro === "con") return p.movimientos > 0;
  if (filtro === "diferencia") return p.diferencia != null && Math.abs(p.diferencia) > 0.5;
  if (filtro === "pagadoSinMovimiento") return p.estado === "E" && p.movimientos === 0;
  return true;
}

export async function listPagos(filtros = {}) {
  const size = TAMANOS.includes(Number(filtros.size)) ? Number(filtros.size) : 25;
  const [filas, mapas] = await Promise.all([
    prisma.pagoProgramado.findMany({
      where: await whereDe(filtros),
      include: { asociaciones: { select: { valor: true } }, gastoPeriodico: { select: { periodicidad: true } } },
      orderBy: [{ fecha: "asc" }, { id: "asc" }],
    }),
    mapasCatalogos(),
  ]);
  let items = filas.map((p) => toClientPago(p, mapas)).filter((p) => pasaAsociacion(p, filtros.asociacion));
  // sentido: los pagos con los que se arma la cifra de Egresos o de Ingresos (I, E y J según su signo).
  if (filtros.sentido === "egreso") items = items.filter((p) => TIPOS_QUE_SUMAN.includes(p.tipo) && esEgreso(p));
  if (filtros.sentido === "ingreso") items = items.filter((p) => TIPOS_QUE_SUMAN.includes(p.tipo) && esIngreso(p));
  if (filtros.orden === "reciente") items = items.reverse();
  // Totales del filtro (suman I, E y J según su signo; los pendientes aparte).
  const totales = { ingresos: 0, egresos: 0, pendienteEgresos: 0, pendienteIngresos: 0, pendientes: 0, pagados: 0, conDiferencia: 0 };
  for (const p of items) {
    if (p.estado === "P") totales.pendientes++; else totales.pagados++;
    if (p.diferencia != null && Math.abs(p.diferencia) > 0.5) totales.conDiferencia++;
    if (!TIPOS_QUE_SUMAN.includes(p.tipo)) continue;
    if (esIngreso(p)) { totales.ingresos += p.valor; if (p.estado === "P") totales.pendienteIngresos += p.valor; }
    if (esEgreso(p)) { totales.egresos += p.valor; if (p.estado === "P") totales.pendienteEgresos += p.valor; }
  }
  for (const k of ["ingresos", "egresos", "pendienteEgresos", "pendienteIngresos"]) totales[k] = redondear(totales[k]);
  const total = items.length;
  const paginas = Math.max(1, Math.ceil(total / size));
  const page = Math.min(Math.max(1, Number(filtros.page) || 1), paginas);
  return { items: items.slice((page - 1) * size, page * size), total, page, size, totales };
}

export async function getPago(id) {
  const p = await prisma.pagoProgramado.findUnique({
    where: { id: Number(id) || 0 },
    include: {
      gastoPeriodico: { select: { periodicidad: true, diaCorte: true, activo: true } },
      asociaciones: { include: { movimiento: { select: { id: true, bancoId: true, tipo: true, fecha: true, descripcion: true, concepto: true, tercero: true, valor: true, moneda: true } } }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!p) throw notFound("El pago no existe.");
  const mapas = await mapasCatalogos();
  return {
    ...toClientPago(p, mapas),
    listaMovimientos: p.asociaciones.map((a) => ({
      asociacionId: a.id, movimientoId: a.movimientoId, valor: num(a.valor), valorTexto: fmtMoneda(a.valor, a.movimiento.moneda), origen: a.origen,
      fecha: a.movimiento.fecha, banco: mapas.bancos.get(a.movimiento.bancoId)?.nombre, tipo: a.movimiento.tipo,
      descripcion: a.movimiento.descripcion, concepto: a.movimiento.concepto, tercero: a.movimiento.tercero,
      valorMovimiento: num(a.movimiento.valor), valorMovimientoTexto: fmtMoneda(a.movimiento.valor, a.movimiento.moneda),
    })),
  };
}

// Valida y arma los datos de un pago. valor llega positivo; el tipo le pone el signo (T: signo "sale"/"entra").
export async function datosPagoValidos(body, actual = null) {
  const v = (k) => (body[k] !== undefined ? body[k] : actual?.[k]);
  const tipo = v("tipo");
  if (!TIPOS_PAGO[tipo]) throw badRequest("Tipo inválido: I, E, J, S o T.");
  const estado = v("estado") || "P";
  if (!ESTADOS_PAGO[estado]) throw badRequest("Estado inválido: P (pendiente) o E (pagado).");
  const fecha = fechaValida(v("fecha"), "La fecha del pago");
  const valorBase = body.valor !== undefined ? numero(body.valor) : num(actual?.valor);
  const signoT = body.sentido === "sale" ? -1 : body.sentido === "entra" ? 1 : actual && actual.tipo === "T" ? (num(actual.valor) < 0 ? -1 : 1) : -1;
  const valor = valorConSigno(tipo, valorBase, signoT);
  const conceptoId = Number(v("conceptoId")) || null;
  const concepto = conceptoId ? await prisma.conceptoTesoreria.findUnique({ where: { id: conceptoId } }) : null;
  if (!concepto) throw badRequest("Elige el concepto.");
  const itemId = body.itemId !== undefined ? Number(body.itemId) || null : actual ? actual.itemId : concepto.itemId;
  if (itemId && !(await prisma.itemTesoreria.findUnique({ where: { id: itemId } }))) throw badRequest("El ítem no existe.");
  const medioPagoId = Number(v("medioPagoId")) || null;
  if (medioPagoId && !(await prisma.medioPagoTesoreria.findUnique({ where: { id: medioPagoId } }))) throw badRequest("El medio de pago no existe.");
  const pagadorId = Number(v("pagadorId")) || null;
  if (pagadorId && !(await prisma.pagadorTesoreria.findUnique({ where: { id: pagadorId } }))) throw badRequest("Quien paga no existe en el catálogo.");
  return {
    tipo, estado, fecha, anio: Number(fecha.slice(0, 4)), mes: Number(fecha.slice(5, 7)), fechaAproximada: body.fecha !== undefined ? false : actual?.fechaAproximada ?? false,
    valor, conceptoId, concepto: concepto.nombre, itemId, medioPagoId, pagadorId, observacion: limpiar(v("observacion"), 1000),
  };
}

export async function paraAuditoriaPago(p) {
  if (!p) return null;
  const m = await mapasCatalogos();
  return {
    fecha: p.fecha, tipo: TIPOS_PAGO[p.tipo] || p.tipo, estado: ESTADOS_PAGO[p.estado] || p.estado, valor: fmtMoneda(p.valor, p.moneda),
    item: p.itemId ? m.items.get(p.itemId)?.nombre : null, concepto: p.concepto, medioPago: p.medioPagoId ? m.medios.get(p.medioPagoId)?.nombre : null,
    pagador: p.pagadorId ? m.pagadores.get(p.pagadorId)?.nombre : null, observacion: p.observacion,
  };
}
const resumenPago = (p) => `${p.concepto} · ${String(p.mes).padStart(2, "0")}/${p.anio} · ${fmtMoneda(p.valor, p.moneda)}`;

export async function crearPago(actor, body, { origen = "manual", silencioso = false } = {}) {
  const data = await datosPagoValidos(body);
  const p = await prisma.pagoProgramado.create({
    data: { ...data, estadoPor: data.estado === "E" ? "manual" : null, origen, creadoPorUserId: actor?.id || null, creadoPorNombre: actor?.nombre || null },
  });
  if (!silencioso) logTesoreria(actor, { action: "crear", entityType: "pagoTesoreria", recordId: p.id, recordInfo: resumenPago(p), after: await paraAuditoriaPago(p) }).catch(() => {});
  if (!silencioso && p.estado === "E") publicarPagoPagado(p.id, actor, "Creado ya pagado");
  return p;
}

export async function editarPago(actor, id, body) {
  const actual = await prisma.pagoProgramado.findUnique({ where: { id: Number(id) || 0 }, include: { _count: { select: { asociaciones: true } } } });
  if (!actual) throw notFound("El pago no existe.");
  const data = await datosPagoValidos(body, actual);
  if (actual._count.asociaciones && data.estado === "P") throw badRequest("El pago tiene movimientos asociados: quítalos para dejarlo pendiente.");
  const estadoPor = data.estado !== actual.estado ? (data.estado === "E" ? "manual" : null) : actual.estadoPor;
  const p = await prisma.pagoProgramado.update({ where: { id: actual.id }, data: { ...data, estadoPor } });
  if (actual.estado !== "E" && p.estado === "E") publicarPagoPagado(p.id, actor, "Marcado como pagado a mano");
  // Si corrigieron un valor en 0, su alerta de la importación ya no aplica.
  if (num(p.valor) !== 0) await prisma.alertaTesoreria.updateMany({ where: { refTipo: "pago", refId: p.id, tipo: "valorCero", resuelta: false }, data: { resuelta: true, resueltaPorNombre: actor?.nombre || null, resueltaAt: new Date() } });
  logTesoreria(actor, { action: "editar", entityType: "pagoTesoreria", recordId: p.id, recordInfo: resumenPago(p), before: await paraAuditoriaPago(actual), after: await paraAuditoriaPago(p) }).catch(() => {});
  return p;
}

export async function borrarPago(actor, id) {
  const actual = await prisma.pagoProgramado.findUnique({ where: { id: Number(id) || 0 }, include: { _count: { select: { asociaciones: true } } } });
  if (!actual) throw notFound("El pago no existe.");
  if (actual._count.asociaciones) throw badRequest("El pago tiene movimientos asociados: quítalos antes de borrarlo.");
  await prisma.pagoProgramado.delete({ where: { id: actual.id } });
  logTesoreria(actor, { action: "eliminar", entityType: "pagoTesoreria", recordId: actual.id, recordInfo: resumenPago(actual), before: await paraAuditoriaPago(actual) }).catch(() => {});
  return { ok: true };
}
