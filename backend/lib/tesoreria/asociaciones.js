import { prisma } from "@/lib/prisma";
import { publicarPagoPagado, publicarMovimientosRegistrados } from "@/lib/tesoreria/eventos";
import { logTesoreria } from "@/lib/audit";
import { badRequest, notFound, numero, fmtMoneda, redondear, exigirMesAbierto } from "@/lib/tesoreria/comun";

// Asociación movimiento ↔ pago programado (varios a varios). La persona dice cuánto del movimiento va a cada pago.
// - Un movimiento no puede repartir más de su valor.
// - Un pago puede recibir más o menos de lo programado: se muestra la diferencia y la persona corrige el valor del pago o
//   del movimiento si quiere.
// - Con al menos una asociación el pago pasa a E (pagado, estadoPor "asociacion"); si se le quitan todas y había pasado
//   a E por una asociación, vuelve a P.

const TOLERANCIA = 0.5;
const num = (d) => (d == null ? 0 : Number(d));

function listaValida(lista, campoId) {
  if (!Array.isArray(lista)) throw badRequest("Las asociaciones deben ser una lista.");
  const vistos = new Set();
  return lista.map((a) => {
    const id = Number(a?.[campoId]) || 0;
    if (!id) throw badRequest("Falta el pago o el movimiento de una asociación.");
    if (vistos.has(id)) throw badRequest("Un mismo pago o movimiento aparece dos veces en la asociación.");
    vistos.add(id);
    const valor = numero(a.valor, "El valor asociado");
    if (!(valor > 0)) throw badRequest("Cada asociación debe llevar un valor mayor que cero.");
    return { id, valor };
  });
}

// Recalcula el estado de los pagos tocados según si les quedan asociaciones.
// actor (opcional): para el evento «un pago pasó a pagado» de las notificaciones.
export async function recalcularEstados(tx, pagoIds, actor = null) {
  const ids = [...new Set(pagoIds)].filter(Boolean);
  if (!ids.length) return;
  const pagos = await tx.pagoProgramado.findMany({ where: { id: { in: ids } }, select: { id: true, estado: true, estadoPor: true, _count: { select: { asociaciones: true } } } });
  for (const p of pagos) {
    if (p._count.asociaciones && p.estado !== "E") {
      await tx.pagoProgramado.update({ where: { id: p.id }, data: { estado: "E", estadoPor: "asociacion" } });
      publicarPagoPagado(p.id, actor, "Asociado al movimiento del banco");
    }
    if (p._count.asociaciones && p.estado === "E" && p.estadoPor !== "asociacion") await tx.pagoProgramado.update({ where: { id: p.id }, data: { estadoPor: "asociacion" } });
    if (!p._count.asociaciones && p.estado === "E" && p.estadoPor === "asociacion") await tx.pagoProgramado.update({ where: { id: p.id }, data: { estado: "P", estadoPor: null } });
  }
}

const textoPago = (p) => `#${p.id} ${p.concepto} (${String(p.mes).padStart(2, "0")}/${p.anio})`;
const textoMov = (m) => `#${m.id} ${m.fecha} ${m.concepto || m.descripcion}`;

async function auditar(actor, { movimiento, antes, despues, pagos, desde }) {
  const nombre = new Map(pagos.map((p) => [p.id, textoPago(p)]));
  const fmt = (l) => (l.length ? l.map((a) => `${nombre.get(a.pagoId) || `#${a.pagoId}`}: ${fmtMoneda(a.valor, movimiento.moneda)}`).join(" · ") : null);
  logTesoreria(actor, {
    action: "asociar", entityType: "asociacionTesoreria", recordId: movimiento.id,
    recordInfo: `Movimiento ${textoMov(movimiento)}${desde ? ` (desde ${desde})` : ""}`,
    before: { movimiento: textoMov(movimiento), pagos: fmt(antes) }, after: { movimiento: textoMov(movimiento), pagos: fmt(despues) },
  }).catch(() => {});
}

// Deja las asociaciones de UN movimiento exactamente como la lista [{ pagoId, valor }].
export async function asociarMovimiento(actor, movimientoId, lista, { origen = "manual", tx: txExterno = null } = {}) {
  const items = listaValida(lista, "pagoId");
  const run = async (tx) => {
    const mv = await tx.movimientoBanco.findUnique({ where: { id: Number(movimientoId) || 0 }, include: { asociaciones: true } });
    if (!mv) throw notFound("El movimiento no existe.");
    await exigirMesAbierto(mv.fecha);
    const total = redondear(items.reduce((s, a) => s + a.valor, 0));
    if (total > num(mv.valor) + TOLERANCIA) throw badRequest(`Se reparten ${fmtMoneda(total, mv.moneda)} y el movimiento es de ${fmtMoneda(mv.valor, mv.moneda)}: no se puede asignar más de lo que vale.`);
    const pagos = items.length ? await tx.pagoProgramado.findMany({ where: { id: { in: items.map((a) => a.id) } } }) : [];
    if (pagos.length !== items.length) throw badRequest("Alguno de los pagos ya no existe.");
    const antes = mv.asociaciones.map((a) => ({ pagoId: a.pagoId, valor: num(a.valor) }));
    const nuevos = new Map(items.map((a) => [a.id, a.valor]));
    for (const a of mv.asociaciones) {
      if (!nuevos.has(a.pagoId)) await tx.asociacionPago.delete({ where: { id: a.id } });
      else if (Math.abs(num(a.valor) - nuevos.get(a.pagoId)) > 0.001) await tx.asociacionPago.update({ where: { id: a.id }, data: { valor: nuevos.get(a.pagoId) } });
    }
    const yaTenia = new Set(mv.asociaciones.map((a) => a.pagoId));
    for (const a of items) {
      if (!yaTenia.has(a.id)) await tx.asociacionPago.create({ data: { movimientoId: mv.id, pagoId: a.id, valor: a.valor, origen, creadoPorUserId: actor?.id || null, creadoPorNombre: actor?.nombre || null } });
    }
    await recalcularEstados(tx, [...yaTenia, ...items.map((a) => a.id)], actor);
    const despues = items.map((a) => ({ pagoId: a.id, valor: a.valor }));
    const cambio = JSON.stringify([...antes].sort((x, y) => x.pagoId - y.pagoId)) !== JSON.stringify([...despues].sort((x, y) => x.pagoId - y.pagoId));
    const todosPagos = await tx.pagoProgramado.findMany({ where: { id: { in: [...yaTenia, ...items.map((a) => a.id)] } } });
    return { mv, antes, despues, cambio, pagos: todosPagos };
  };
  const r = txExterno ? await run(txExterno) : await prisma.$transaction(run);
  if (r.cambio) await auditar(actor, { movimiento: r.mv, antes: r.antes, despues: r.despues, pagos: r.pagos, desde: origen === "agente" ? "el agente de asociación" : null });
  return { ok: true };
}

// Deja las asociaciones de UN pago como la lista [{ movimientoId, valor }] (asociar desde el pago).
export async function asociarPago(actor, pagoId, lista) {
  const items = listaValida(lista, "movimientoId");
  const pago = await prisma.pagoProgramado.findUnique({ where: { id: Number(pagoId) || 0 }, include: { asociaciones: true } });
  if (!pago) throw notFound("El pago no existe.");
  const movIds = [...new Set([...pago.asociaciones.map((a) => a.movimientoId), ...items.map((a) => a.id)])];
  await prisma.$transaction(async (tx) => {
    const movs = await tx.movimientoBanco.findMany({ where: { id: { in: movIds } }, include: { asociaciones: true } });
    if (movs.length !== movIds.length) throw badRequest("Alguno de los movimientos ya no existe.");
    for (const mv of movs) {
      // El resto de asociaciones del movimiento se conserva; solo cambia la de este pago.
      const otras = mv.asociaciones.filter((a) => a.pagoId !== pago.id).map((a) => ({ pagoId: a.pagoId, valor: num(a.valor) }));
      const nueva = items.find((a) => a.id === mv.id);
      await asociarMovimiento(actor, mv.id, nueva ? [...otras, { pagoId: pago.id, valor: nueva.valor }] : otras, { tx });
    }
  });
  return { ok: true };
}

// Cuánto se ha asignado de cada movimiento y a cada pago (para las tablas).
export const asignadoDe = (asociaciones = []) => redondear(asociaciones.reduce((s, a) => s + num(a.valor), 0));
