import { prisma } from "@/lib/prisma";
import { logTesoreria } from "@/lib/audit";
import { badRequest, notFound, limpiar, numero, fechaValida, exigirMesAbierto, fmtMoneda, rangoMes } from "@/lib/tesoreria/comun";

// El libro de Tesorería. Cada movimiento: fecha exacta, tipo (ingreso / egreso / traslado entre cuentas propias), estado
// (proyectado / ejecutado; "conciliado" = tiene líneas del extracto enlazadas), valor POSITIVO en la moneda ISO 4217 de
// su cuenta, ítem, concepto, quién paga, tercero, referencia y sus soportes.

export const TIPOS = ["ingreso", "egreso", "traslado"];
export const ESTADOS = ["proyectado", "ejecutado"];
const num = (d) => (d == null ? null : Number(d));

export async function mapasCatalogos() {
  const [cuentas, items, conceptos, pagadores] = await Promise.all([
    prisma.cuentaTesoreria.findMany(), prisma.itemTesoreria.findMany(), prisma.conceptoTesoreria.findMany(), prisma.pagadorTesoreria.findMany(),
  ]);
  const m = (l) => new Map(l.map((x) => [x.id, x]));
  return { cuentas: m(cuentas), items: m(items), conceptos: m(conceptos), pagadores: m(pagadores) };
}

export function toClientMovimiento(mv, mapas) {
  const c = mapas.cuentas.get(mv.cuentaId);
  return {
    id: mv.id,
    fecha: mv.fecha,
    fechaAproximada: mv.fechaAproximada,
    tipo: mv.tipo,
    estado: mv.estado,
    conciliado: (mv._count?.lineas ?? mv.lineas?.length ?? 0) > 0,
    valor: num(mv.valor),
    moneda: mv.moneda,
    valorTexto: fmtMoneda(mv.valor, mv.moneda),
    cuentaId: mv.cuentaId,
    cuenta: c?.nombre || "—",
    cuentaDestinoId: mv.cuentaDestinoId,
    cuentaDestino: mv.cuentaDestinoId ? mapas.cuentas.get(mv.cuentaDestinoId)?.nombre || "—" : null,
    itemId: mv.itemId,
    item: mv.itemId ? mapas.items.get(mv.itemId)?.nombre || "—" : null,
    conceptoId: mv.conceptoId,
    // Nombre vivo del catálogo (si cambió en Maestros se ve el nuevo); el texto guardado es el respaldo.
    concepto: (mv.conceptoId && mapas.conceptos.get(mv.conceptoId)?.nombre) || mv.concepto,
    pagadorId: mv.pagadorId,
    pagador: mv.pagadorId ? mapas.pagadores.get(mv.pagadorId)?.nombre || "—" : null,
    tercero: mv.tercero,
    referencia: mv.referencia,
    observacion: mv.observacion,
    origen: mv.origen,
    soportes: mv._count?.soportes ?? mv.soportes?.length ?? 0,
    createdAt: mv.createdAt,
    creadoPorNombre: mv.creadoPorNombre,
  };
}

function whereDe({ q, anio, mes, desde, hasta, cuentaId, itemId, conceptoId, pagadorId, estado, tipo }) {
  const and = [];
  if (anio && mes) { const r = rangoMes(Number(anio), Number(mes)); and.push({ fecha: { gte: r.desde, lte: r.hasta } }); }
  else if (anio) and.push({ fecha: { gte: `${anio}-01-01`, lte: `${anio}-12-31` } });
  if (desde) and.push({ fecha: { gte: desde } });
  if (hasta) and.push({ fecha: { lte: hasta } });
  if (cuentaId) and.push({ OR: [{ cuentaId: Number(cuentaId) }, { cuentaDestinoId: Number(cuentaId) }] });
  if (itemId) and.push({ itemId: Number(itemId) });
  if (conceptoId) and.push({ conceptoId: Number(conceptoId) });
  if (pagadorId) and.push({ pagadorId: Number(pagadorId) });
  if (tipo) and.push({ tipo });
  if (estado === "proyectado" || estado === "ejecutado") and.push({ estado });
  if (estado === "conciliado") and.push({ lineas: { some: {} } });
  if (estado === "porConciliar") and.push({ estado: "ejecutado", lineas: { none: {} } });
  if (estado === "sinSoporte") and.push({ estado: "ejecutado", soportes: { none: {} } });
  if (q) {
    const t = String(q).trim();
    and.push({ OR: [{ concepto: { contains: t, mode: "insensitive" } }, { tercero: { contains: t, mode: "insensitive" } }, { referencia: { contains: t, mode: "insensitive" } }, { observacion: { contains: t, mode: "insensitive" } }] });
  }
  return and.length ? { AND: and } : {};
}

export async function listMovimientos(filtros = {}) {
  const size = [10, 25, 50, 100].includes(Number(filtros.size)) ? Number(filtros.size) : 25;
  const where = whereDe(filtros);
  const [total, sumas, mapas] = await Promise.all([
    prisma.movimientoTesoreria.count({ where }),
    prisma.movimientoTesoreria.groupBy({ by: ["tipo", "moneda"], where, _sum: { valor: true } }),
    mapasCatalogos(),
  ]);
  const paginas = Math.max(1, Math.ceil(total / size));
  const page = Math.min(Math.max(1, Number(filtros.page) || 1), paginas);
  const filas = await prisma.movimientoTesoreria.findMany({
    where, orderBy: [{ fecha: "desc" }, { id: "desc" }], skip: (page - 1) * size, take: size,
    include: { _count: { select: { lineas: true, soportes: true } } },
  });
  // Totales del filtro por moneda (nunca se suman monedas distintas).
  const totales = {};
  for (const s of sumas) {
    totales[s.moneda] ??= { moneda: s.moneda, ingresos: 0, egresos: 0, traslados: 0 };
    totales[s.moneda][s.tipo === "ingreso" ? "ingresos" : s.tipo === "egreso" ? "egresos" : "traslados"] += num(s._sum.valor) || 0;
  }
  return { items: filas.map((f) => toClientMovimiento(f, mapas)), total, page, size, totales: Object.values(totales) };
}

export async function getMovimiento(id) {
  const mv = await prisma.movimientoTesoreria.findUnique({
    where: { id: Number(id) || 0 },
    include: {
      soportes: { select: { id: true, nombre: true, tipoMime: true, tamano: true, createdAt: true, creadoPorNombre: true } },
      lineas: { select: { id: true, fecha: true, descripcion: true, tercero: true, valor: true, comoSeEnlazo: true, enlazadoPorNombre: true } },
    },
  });
  if (!mv) throw notFound("El movimiento no existe.");
  const mapas = await mapasCatalogos();
  return {
    ...toClientMovimiento(mv, mapas),
    listaSoportes: mv.soportes,
    lineasExtracto: mv.lineas.map((l) => ({ ...l, valor: num(l.valor), cuenta: mapas.cuentas.get(mv.cuentaId)?.nombre })),
  };
}

// Valida y arma los datos. El concepto es obligatorio y viene del catálogo; el ítem por defecto es el del concepto.
async function datosValidos(body, actual = null) {
  const v = (k) => (body[k] !== undefined ? body[k] : actual?.[k]);
  const tipo = v("tipo");
  if (!TIPOS.includes(tipo)) throw badRequest("Tipo inválido: ingreso, egreso o traslado.");
  const estado = v("estado") || "ejecutado";
  if (!ESTADOS.includes(estado)) throw badRequest("Estado inválido: proyectado o ejecutado.");
  const fecha = fechaValida(v("fecha"));
  const valor = numero(v("valor"));
  if (!(valor > 0)) throw badRequest("El valor debe ser mayor que cero (el tipo dice si entra o sale).");
  const cuenta = await prisma.cuentaTesoreria.findUnique({ where: { id: Number(v("cuentaId")) || 0 } });
  if (!cuenta || (!cuenta.activo && cuenta.id !== actual?.cuentaId)) throw badRequest("Elige una cuenta activa.");
  let cuentaDestinoId = null;
  if (tipo === "traslado") {
    const destino = await prisma.cuentaTesoreria.findUnique({ where: { id: Number(v("cuentaDestinoId")) || 0 } });
    if (!destino) throw badRequest("Un traslado necesita la cuenta destino.");
    if (destino.id === cuenta.id) throw badRequest("La cuenta destino debe ser distinta de la de origen.");
    if (destino.moneda !== cuenta.moneda) throw badRequest(`Las dos cuentas deben tener la misma moneda (${cuenta.moneda} y ${destino.moneda}).`);
    cuentaDestinoId = destino.id;
  }
  const conceptoId = Number(v("conceptoId")) || null;
  const concepto = conceptoId ? await prisma.conceptoTesoreria.findUnique({ where: { id: conceptoId } }) : null;
  if (!concepto) throw badRequest("Elige el concepto (Maestros de Tesorería › Conceptos).");
  let itemId = body.itemId !== undefined ? Number(body.itemId) || null : actual ? actual.itemId : concepto.itemId;
  if (itemId && !(await prisma.itemTesoreria.findUnique({ where: { id: itemId } }))) throw badRequest("El ítem no existe.");
  const pagadorId = Number(v("pagadorId")) || null;
  if (pagadorId && !(await prisma.pagadorTesoreria.findUnique({ where: { id: pagadorId } }))) throw badRequest("Quien paga no existe en el catálogo.");
  return {
    tipo, estado, fecha, valor, moneda: cuenta.moneda, cuentaId: cuenta.id, cuentaDestinoId, itemId, conceptoId, concepto: concepto.nombre, pagadorId,
    tercero: limpiar(v("tercero"), 200), referencia: limpiar(v("referencia"), 120), observacion: limpiar(v("observacion"), 1000),
    fechaAproximada: body.fecha !== undefined ? false : actual?.fechaAproximada ?? false,
  };
}

export async function paraAuditoriaMov(mv) {
  if (!mv) return null;
  const m = await mapasCatalogos();
  return {
    fecha: mv.fecha, tipo: mv.tipo, estado: mv.estado, valor: fmtMoneda(mv.valor, mv.moneda), moneda: mv.moneda,
    cuenta: m.cuentas.get(mv.cuentaId)?.nombre, cuentaDestino: mv.cuentaDestinoId ? m.cuentas.get(mv.cuentaDestinoId)?.nombre : null,
    item: mv.itemId ? m.items.get(mv.itemId)?.nombre : null, concepto: mv.concepto, pagador: mv.pagadorId ? m.pagadores.get(mv.pagadorId)?.nombre : null,
    tercero: mv.tercero, referencia: mv.referencia, observacion: mv.observacion,
  };
}

const resumenMov = (mv) => `${mv.concepto} · ${fmtMoneda(mv.valor, mv.moneda)} · ${mv.fecha}`;

export async function crearMovimiento(actor, body, { origen = "manual" } = {}) {
  const data = await datosValidos(body);
  await exigirMesAbierto(data.fecha);
  if (data.referencia) {
    const dup = await prisma.movimientoTesoreria.findFirst({ where: { cuentaId: data.cuentaId, referencia: data.referencia }, select: { id: true, fecha: true } });
    if (dup) throw badRequest(`Ya hay un movimiento con la referencia ${data.referencia} en esa cuenta (#${dup.id}, ${dup.fecha}).`);
  }
  const mv = await prisma.movimientoTesoreria.create({ data: { ...data, origen, creadoPorUserId: actor.id, creadoPorNombre: actor.nombre || null } });
  logTesoreria(actor, { action: "crear", entityType: "movimientoTesoreria", recordId: mv.id, recordInfo: resumenMov(mv), after: await paraAuditoriaMov(mv) }).catch(() => {});
  return mv;
}

export async function editarMovimiento(actor, id, body) {
  const actual = await prisma.movimientoTesoreria.findUnique({ where: { id: Number(id) || 0 }, include: { _count: { select: { lineas: true } } } });
  if (!actual) throw notFound("El movimiento no existe.");
  await exigirMesAbierto(actual.fecha);
  const data = await datosValidos(body, actual);
  await exigirMesAbierto(data.fecha);
  if (actual._count.lineas && (data.valor !== Number(actual.valor) || data.cuentaId !== actual.cuentaId || data.tipo !== actual.tipo)) {
    throw badRequest("El movimiento está conciliado: quita primero el enlace con el extracto para cambiarle el valor, la cuenta o el tipo.");
  }
  const mv = await prisma.movimientoTesoreria.update({ where: { id: actual.id }, data });
  logTesoreria(actor, { action: "editar", entityType: "movimientoTesoreria", recordId: mv.id, recordInfo: resumenMov(mv), before: await paraAuditoriaMov(actual), after: await paraAuditoriaMov(mv) }).catch(() => {});
  return mv;
}

export async function borrarMovimiento(actor, id) {
  const actual = await prisma.movimientoTesoreria.findUnique({ where: { id: Number(id) || 0 }, include: { _count: { select: { lineas: true } } } });
  if (!actual) throw notFound("El movimiento no existe.");
  await exigirMesAbierto(actual.fecha);
  if (actual._count.lineas) throw badRequest("El movimiento está conciliado con el extracto: quita el enlace antes de borrarlo.");
  await prisma.movimientoTesoreria.delete({ where: { id: actual.id } });
  logTesoreria(actor, { action: "eliminar", entityType: "movimientoTesoreria", recordId: actual.id, recordInfo: resumenMov(actual), before: await paraAuditoriaMov(actual) }).catch(() => {});
  return { ok: true };
}
