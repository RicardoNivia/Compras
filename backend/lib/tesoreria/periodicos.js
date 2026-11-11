import { prisma } from "@/lib/prisma";
import { logTesoreria } from "@/lib/audit";
import { hoyColombia } from "@/lib/hoyColombia";
import { mapasCatalogos } from "@/lib/tesoreria/maestros";
import {
  badRequest, notFound, limpiar, numero, fechaValida, fmtMoneda, valorConSigno, fechaDe, sumarDias,
  TIPOS_PAGO, PERIODICIDADES, PASO_MESES,
} from "@/lib/tesoreria/comun";

// Gastos periódicos: lo que se paga (o se recibe) cada cierto tiempo. Cada uno genera sus pagos programados en P:
//   - al crearlo o editarlo: desde el mes en curso (nunca hacia atrás) hasta su fecha fin o hasta diciembre del año
//     actual, uno por periodo (gasto + periodo es único, así nunca se duplica);
//   - «Replicar pagos» llena un año completo (el siguiente, al cambiar de año) con los gastos activos.
// El valor de cada pago nuevo es el ÚLTIMO VALOR REAL pagado de ese gasto (el último pago en E con valor); si nunca se
// ha pagado, el valor del gasto. Quincenal = el día de corte y 15 días después. Desactivado deja de generar y se borran
// sus pagos futuros pendientes que no tienen movimientos.

const num = (d) => (d == null ? 0 : Number(d));
const mesDeHoy = () => hoyColombia().slice(0, 7);

// Periodos del gasto entre dos fechas (AAAA-MM-DD, inclusive), según su periodicidad, día de corte e inicio/fin.
export function periodosDe(g, desde, hasta) {
  const out = [];
  const paso = PASO_MESES[g.periodicidad] || 1;
  let anio = Number(g.fechaInicio.slice(0, 4));
  let mes = Number(g.fechaInicio.slice(5, 7));
  const fin = g.fechaFin && g.fechaFin < hasta ? g.fechaFin : hasta;
  for (let i = 0; i < 1200; i++) {
    const base = `${anio}-${String(mes).padStart(2, "0")}`;
    if (`${base}-01` > fin) break;
    const f1 = fechaDe(anio, mes, g.diaCorte);
    const lista = [{ periodo: base, fecha: f1 }];
    if (g.periodicidad === "quincenal") lista.push({ periodo: `${base}-Q2`, fecha: sumarDias(f1, 15) });
    for (const p of lista) {
      if (p.fecha >= desde && p.fecha <= fin && p.fecha >= g.fechaInicio.slice(0, 7) + "-01") out.push({ ...p, anio, mes });
    }
    mes += paso;
    while (mes > 12) { mes -= 12; anio += 1; }
  }
  return out;
}

async function ultimoValorReal(gastoId) {
  const p = await prisma.pagoProgramado.findFirst({ where: { gastoPeriodicoId: gastoId, estado: "E", NOT: { valor: 0 } }, orderBy: [{ fecha: "desc" }, { id: "desc" }], select: { valor: true } });
  return p ? num(p.valor) : null;
}

// Crea los pagos de los periodos que faltan entre desde y hasta. Devuelve cuántos creó.
export async function generarPagosDe(actor, g, desde, hasta) {
  if (!g.activo) return 0;
  const periodos = periodosDe(g, desde, hasta);
  if (!periodos.length) return 0;
  const valor = (await ultimoValorReal(g.id)) ?? num(g.valor);
  const concepto = await prisma.conceptoTesoreria.findUnique({ where: { id: g.conceptoId }, select: { nombre: true } });
  const r = await prisma.pagoProgramado.createMany({
    data: periodos.map((p) => ({
      anio: Number(p.fecha.slice(0, 4)), mes: Number(p.fecha.slice(5, 7)), fecha: p.fecha, tipo: g.tipo, estado: "P", itemId: g.itemId, conceptoId: g.conceptoId, concepto: concepto?.nombre || "—",
      medioPagoId: g.medioPagoId, pagadorId: g.pagadorId, valor, moneda: g.moneda, gastoPeriodicoId: g.id, periodo: p.periodo, origen: "periodico",
      creadoPorUserId: actor?.id || null, creadoPorNombre: actor?.nombre || "Gasto periódico",
    })),
    skipDuplicates: true,
  });
  return r.count;
}

const finDeAnio = () => `${hoyColombia().slice(0, 4)}-12-31`;
const inicioMesActual = () => `${mesDeHoy()}-01`;

// Pagos futuros (desde el mes en curso) del gasto que siguen pendientes y sin movimientos: se pueden rehacer.
// Apagar: los pagos en P desde hoy (de este y de los años siguientes) se borran, salvo los que tienen movimientos.
const pendientesDesdeHoy = (gastoId) => ({ gastoPeriodicoId: gastoId, estado: "P", fecha: { gte: hoyColombia() } });
export async function vistaApagar(id) {
  const g = await prisma.gastoPeriodico.findUnique({ where: { id: Number(id) || 0 } });
  if (!g) throw notFound("El gasto periódico no existe.");
  const pagos = await prisma.pagoProgramado.findMany({ where: pendientesDesdeHoy(g.id), select: { anio: true, _count: { select: { asociaciones: true } } } });
  const porAnio = {};
  for (const p of pagos) { const x = (porAnio[p.anio] ||= { anio: p.anio, seBorran: 0, seConservan: 0 }); if (p._count.asociaciones) x.seConservan += 1; else x.seBorran += 1; }
  const lista = Object.values(porAnio).sort((a, b) => a.anio - b.anio);
  return { id: g.id, hoy: hoyColombia(), seBorran: lista.reduce((s, x) => s + x.seBorran, 0), seConservan: lista.reduce((s, x) => s + x.seConservan, 0), porAnio: lista };
}

async function borrarFuturosPendientes(gastoId) {
  const r = await prisma.pagoProgramado.deleteMany({ where: { gastoPeriodicoId: gastoId, estado: "P", fecha: { gte: inicioMesActual() }, asociaciones: { none: {} } } });
  return r.count;
}

// anio (opcional): pendientes, pagados y próximo pago de ESE año; el último valor real pagado es siempre el más reciente.
export async function toClientGastos(gastos, anio = null) {
  const mapas = await mapasCatalogos();
  const ids = gastos.map((g) => g.id);
  const delAnio = anio ? { anio: Number(anio) } : {};
  const [pend, pag, ultimos, pagadosTotal, conMovs] = await Promise.all([
    prisma.pagoProgramado.groupBy({ by: ["gastoPeriodicoId"], where: { gastoPeriodicoId: { in: ids }, estado: "P", ...delAnio }, _count: { _all: true }, _min: { fecha: true } }),
    prisma.pagoProgramado.groupBy({ by: ["gastoPeriodicoId"], where: { gastoPeriodicoId: { in: ids }, estado: "E", ...delAnio }, _count: { _all: true }, _max: { fecha: true } }),
    prisma.pagoProgramado.findMany({ where: { gastoPeriodicoId: { in: ids }, estado: "E", NOT: { valor: 0 } }, orderBy: [{ fecha: "desc" }, { id: "desc" }], distinct: ["gastoPeriodicoId"], select: { gastoPeriodicoId: true, valor: true, fecha: true } }),
    // Historia de TODOS los años: con ella no se puede borrar (se apaga).
    prisma.pagoProgramado.groupBy({ by: ["gastoPeriodicoId"], where: { gastoPeriodicoId: { in: ids }, estado: "E" }, _count: { _all: true } }),
    prisma.pagoProgramado.groupBy({ by: ["gastoPeriodicoId"], where: { gastoPeriodicoId: { in: ids }, asociaciones: { some: {} } }, _count: { _all: true } }),
  ]);
  const PT = new Map(pagadosTotal.map((x) => [x.gastoPeriodicoId, x._count._all]));
  const CM = new Map(conMovs.map((x) => [x.gastoPeriodicoId, x._count._all]));
  const P = new Map(pend.map((x) => [x.gastoPeriodicoId, x]));
  const E = new Map(pag.map((x) => [x.gastoPeriodicoId, x]));
  const U = new Map(ultimos.map((x) => [x.gastoPeriodicoId, x]));
  return gastos.map((g) => ({
    id: g.id,
    tipo: g.tipo,
    tipoTexto: TIPOS_PAGO[g.tipo] || g.tipo,
    itemId: g.itemId,
    item: g.itemId ? mapas.items.get(g.itemId)?.nombre || "—" : null,
    conceptoId: g.conceptoId,
    concepto: mapas.conceptos.get(g.conceptoId)?.nombre || "—",
    medioPagoId: g.medioPagoId,
    medioPago: g.medioPagoId ? mapas.medios.get(g.medioPagoId)?.nombre || "—" : null,
    pagadorId: g.pagadorId,
    pagador: g.pagadorId ? mapas.pagadores.get(g.pagadorId)?.nombre || "—" : null,
    valor: num(g.valor),
    valorTexto: fmtMoneda(g.valor, g.moneda),
    moneda: g.moneda,
    ultimoValorReal: U.get(g.id) ? num(U.get(g.id).valor) : null,
    ultimoValorRealTexto: U.get(g.id) ? fmtMoneda(U.get(g.id).valor, g.moneda) : null,
    ultimoPago: E.get(g.id)?._max.fecha || null,
    pagados: E.get(g.id)?._count._all || 0,
    pagadosTotal: PT.get(g.id) || 0,
    conMovimientos: CM.get(g.id) || 0,
    pendientes: P.get(g.id)?._count._all || 0,
    proximo: P.get(g.id)?._min.fecha || null,
    periodicidad: g.periodicidad,
    periodicidadTexto: PERIODICIDADES[g.periodicidad] || g.periodicidad,
    diaCorte: g.diaCorte,
    fechaInicio: g.fechaInicio,
    fechaFin: g.fechaFin,
    activo: g.activo,
    observacion: g.observacion,
    createdAt: g.createdAt,
    creadoPorNombre: g.creadoPorNombre,
  }));
}

// Gastos vigentes en un año (empiezan antes de que termine y no terminaron antes de que empiece), o todos sin año. Trae
// también los años que tienen pagos programados, para el filtro.
export async function listGastos({ anio } = {}) {
  anio = Number(anio) || null;
  const where = anio ? { fechaInicio: { lte: `${anio}-12-31` }, OR: [{ fechaFin: null }, { fechaFin: { gte: `${anio}-01-01` } }] } : {};
  const [gastos, anios] = await Promise.all([
    prisma.gastoPeriodico.findMany({ where, orderBy: [{ activo: "desc" }, { id: "asc" }] }),
    prisma.pagoProgramado.groupBy({ by: ["anio"], where: { gastoPeriodicoId: { not: null } }, _count: { _all: true } }),
  ]);
  return { anio, items: await toClientGastos(gastos, anio), aniosConPagos: anios.map((a) => ({ anio: a.anio, pagos: a._count._all })).sort((a, b) => a.anio - b.anio), periodicidades: PERIODICIDADES, tipos: TIPOS_PAGO };
}

async function datosGastoValidos(body, actual = null) {
  const v = (k) => (body[k] !== undefined ? body[k] : actual?.[k]);
  const tipo = v("tipo");
  if (!TIPOS_PAGO[tipo]) throw badRequest("Tipo inválido: I, E, J, S o T.");
  const periodicidad = v("periodicidad");
  if (!PERIODICIDADES[periodicidad]) throw badRequest(`Periodicidad inválida: ${Object.keys(PERIODICIDADES).join(", ")}.`);
  const diaCorte = Number(v("diaCorte"));
  if (!Number.isInteger(diaCorte) || diaCorte < 1 || diaCorte > 31) throw badRequest("El día de corte va de 1 a 31.");
  const fechaInicio = fechaValida(v("fechaInicio"), "La fecha de inicio");
  const fechaFin = v("fechaFin") ? fechaValida(v("fechaFin"), "La fecha fin") : null;
  if (fechaFin && fechaFin < fechaInicio) throw badRequest("La fecha fin no puede ser anterior a la de inicio.");
  const valorBase = body.valor !== undefined ? numero(body.valor) : num(actual?.valor);
  const signoT = body.sentido === "sale" ? -1 : body.sentido === "entra" ? 1 : actual && actual.tipo === "T" ? (num(actual.valor) < 0 ? -1 : 1) : -1;
  const conceptoId = Number(v("conceptoId")) || null;
  const concepto = conceptoId ? await prisma.conceptoTesoreria.findUnique({ where: { id: conceptoId } }) : null;
  if (!concepto) throw badRequest("Elige el concepto.");
  const itemId = body.itemId !== undefined ? Number(body.itemId) || null : actual ? actual.itemId : concepto.itemId;
  const medioPagoId = Number(v("medioPagoId")) || null;
  const pagadorId = Number(v("pagadorId")) || null;
  if (itemId && !(await prisma.itemTesoreria.findUnique({ where: { id: itemId } }))) throw badRequest("El ítem no existe.");
  if (medioPagoId && !(await prisma.medioPagoTesoreria.findUnique({ where: { id: medioPagoId } }))) throw badRequest("El medio de pago no existe.");
  if (pagadorId && !(await prisma.pagadorTesoreria.findUnique({ where: { id: pagadorId } }))) throw badRequest("Quien paga no existe en el catálogo.");
  return {
    tipo, periodicidad, diaCorte, fechaInicio, fechaFin, valor: valorConSigno(tipo, valorBase, signoT), conceptoId, itemId, medioPagoId, pagadorId,
    activo: v("activo") === undefined ? true : !!v("activo"), observacion: limpiar(v("observacion"), 500),
  };
}

async function paraAuditoria(g) {
  if (!g) return null;
  const m = await mapasCatalogos();
  return {
    tipo: TIPOS_PAGO[g.tipo], concepto: m.conceptos.get(g.conceptoId)?.nombre, item: g.itemId ? m.items.get(g.itemId)?.nombre : null,
    medioPago: g.medioPagoId ? m.medios.get(g.medioPagoId)?.nombre : null, pagador: g.pagadorId ? m.pagadores.get(g.pagadorId)?.nombre : null,
    valor: fmtMoneda(g.valor, g.moneda), periodicidad: PERIODICIDADES[g.periodicidad], diaCorte: g.diaCorte,
    vigencia: `${g.fechaInicio} → ${g.fechaFin || "sin fecha fin"}`, activo: g.activo ? "Sí" : "No",
  };
}
const nombreGasto = async (g) => `${(await prisma.conceptoTesoreria.findUnique({ where: { id: g.conceptoId } }))?.nombre || "Gasto"} (${PERIODICIDADES[g.periodicidad]})`;

// opciones.vincular: ids de pagos existentes que pasan a ser de este gasto (la importación de la plantilla).
export async function crearGasto(actor, body, { generar = true, silencioso = false } = {}) {
  const data = await datosGastoValidos(body);
  const g = await prisma.gastoPeriodico.create({ data: { ...data, creadoPorUserId: actor?.id || null, creadoPorNombre: actor?.nombre || null } });
  const creados = generar ? await generarPagosDe(actor, g, inicioMesActual(), finDeAnio()) : 0;
  if (!silencioso) logTesoreria(actor, { action: "crear", entityType: "gastoPeriodicoTesoreria", recordId: g.id, recordInfo: `${await nombreGasto(g)} · generó ${creados} pago(s)`, after: await paraAuditoria(g) }).catch(() => {});
  return { ...g, pagosCreados: creados };
}

export async function editarGasto(actor, id, body) {
  const actual = await prisma.gastoPeriodico.findUnique({ where: { id: Number(id) || 0 } });
  if (!actual) throw notFound("El gasto periódico no existe.");
  const data = await datosGastoValidos(body, actual);
  const g = await prisma.gastoPeriodico.update({ where: { id: actual.id }, data });
  if (actual.activo && !g.activo) {
    // Apagado: se borran sus pagos en P desde hoy, menos los que ya tienen movimientos asociados.
    const conservados = await prisma.pagoProgramado.count({ where: { ...pendientesDesdeHoy(g.id), asociaciones: { some: {} } } });
    const r = await prisma.pagoProgramado.deleteMany({ where: { ...pendientesDesdeHoy(g.id), asociaciones: { none: {} } } });
    logTesoreria(actor, { action: "editar", entityType: "gastoPeriodicoTesoreria", recordId: g.id, recordInfo: `${await nombreGasto(g)} · apagado: borró ${r.count} pago(s) pendientes desde hoy, conservó ${conservados} con movimientos`, before: await paraAuditoria(actual), after: await paraAuditoria(g) }).catch(() => {});
    return { ...g, pagosBorrados: r.count, pagosConservados: conservados, pagosCreados: 0 };
  }
  // Lo pendiente del mes en curso en adelante se rehace con los datos nuevos (lo pagado o con movimientos no se toca).
  const borrados = await borrarFuturosPendientes(g.id);
  const creados = await generarPagosDe(actor, g, inicioMesActual(), finDeAnio());
  logTesoreria(actor, { action: "editar", entityType: "gastoPeriodicoTesoreria", recordId: g.id, recordInfo: `${await nombreGasto(g)} · rehízo ${borrados} → ${creados} pago(s) pendientes`, before: await paraAuditoria(actual), after: await paraAuditoria(g) }).catch(() => {});
  return { ...g, pagosBorrados: borrados, pagosCreados: creados };
}

export async function borrarGasto(actor, id) {
  const actual = await prisma.gastoPeriodico.findUnique({ where: { id: Number(id) || 0 } });
  if (!actual) throw notFound("El gasto periódico no existe.");
  const conHistoria = await prisma.pagoProgramado.count({ where: { gastoPeriodicoId: actual.id, OR: [{ estado: "E" }, { asociaciones: { some: {} } }] } });
  if (conHistoria) throw badRequest(`No se puede eliminar: este gasto ya tiene ${conHistoria} pago(s) pagados o con movimientos asociados. Apágalo para que deje de generar pagos.`);
  await prisma.pagoProgramado.deleteMany({ where: { gastoPeriodicoId: actual.id } });
  await prisma.gastoPeriodico.delete({ where: { id: actual.id } });
  logTesoreria(actor, { action: "eliminar", entityType: "gastoPeriodicoTesoreria", recordId: actual.id, recordInfo: await nombreGasto(actual), before: await paraAuditoria(actual) }).catch(() => {});
  return { ok: true };
}

// «Replicar pagos»: llena el año indicado con todos los gastos activos que sigan vigentes ese año.
// Gastos que se replican: activos, vigentes en el año destino y, si se elige año origen, que tuvieron pagos ese año.
async function gastosAReplicar(anio, desde) {
  const where = { activo: true, OR: [{ fechaFin: null }, { fechaFin: { gte: `${anio}-01-01` } }] };
  if (desde) where.pagos = { some: { anio: Number(desde) } };
  return prisma.gastoPeriodico.findMany({ where });
}

// Vista previa de «Replicar»: cuántos gastos y pagos se crearían en el año destino y cuántos ya existen. No escribe.
export async function vistaReplicar(anio, desde = null) {
  anio = Number(anio);
  if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) throw badRequest("Año inválido.");
  const gastos = await gastosAReplicar(anio, desde);
  let porCrear = 0, yaExisten = 0;
  for (const g of gastos) {
    const periodos = periodosDe(g, `${anio}-01-01`, `${anio}-12-31`); // la misma regla que generarPagosDe
    const ya = periodos.length ? await prisma.pagoProgramado.count({ where: { gastoPeriodicoId: g.id, periodo: { in: periodos.map((p) => p.periodo) } } }) : 0;
    porCrear += periodos.length - ya; yaExisten += ya;
  }
  return { anio, desde: desde ? Number(desde) : null, gastos: gastos.length, porCrear, yaExisten };
}

// «Replicar pagos»: llena el año indicado con los gastos activos que sigan vigentes ese año (o solo los que tuvieron
// pagos en el año origen «desde»). Valor = último valor real pagado. No duplica.
export async function replicarAnio(actor, anio, desde = null) {
  anio = Number(anio);
  if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) throw badRequest("Año inválido.");
  const gastos = await gastosAReplicar(anio, desde);
  let creados = 0;
  for (const g of gastos) creados += await generarPagosDe(actor, g, `${anio}-01-01`, `${anio}-12-31`);
  const txt = desde ? ` desde los gastos de ${desde}` : "";
  logTesoreria(actor, { action: "generar", entityType: "gastoPeriodicoTesoreria", recordId: `anio-${anio}`, recordInfo: `Replicó los pagos de ${anio}${txt}: ${creados} pago(s) de ${gastos.length} gasto(s) periódico(s)`, after: { anio, gastos: gastos.length, pagosCreados: creados } }).catch(() => {});
  return { anio, desde: desde ? Number(desde) : null, gastos: gastos.length, creados };
}

// Los periodos de un año que los gastos activos deberían tener y aún no tienen (lo usa «Proponer pagos»).
export async function periodosFaltantes(anio, mes = null) {
  const desde = mes ? fechaDe(anio, mes, 1) : `${anio}-01-01`;
  const hasta = mes ? fechaDe(anio, mes, 31) : `${anio}-12-31`;
  const gastos = await prisma.gastoPeriodico.findMany({ where: { activo: true } });
  const out = [];
  for (const g of gastos) {
    const periodos = periodosDe(g, desde, hasta);
    if (!periodos.length) continue;
    const ya = new Set((await prisma.pagoProgramado.findMany({ where: { gastoPeriodicoId: g.id, periodo: { in: periodos.map((p) => p.periodo) } }, select: { periodo: true } })).map((x) => x.periodo));
    const valor = (await ultimoValorReal(g.id)) ?? num(g.valor);
    for (const p of periodos) if (!ya.has(p.periodo)) out.push({ gasto: g, ...p, valor });
  }
  return out;
}
