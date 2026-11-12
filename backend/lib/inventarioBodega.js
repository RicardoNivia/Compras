import { prisma } from "@/lib/prisma";
import { logInventarioBodega } from "@/lib/audit";
import { hoyColombia } from "@/lib/hoyColombia";

// Inventario (bodega) de Bienestar. Cada artículo es un lote (el mismo producto puede repetirse con otra fecha de
// vencimiento) y su stock SOLO cambia con un movimiento:
//   - entrada: llegó mercancía (a mano o con una compra de Compras, que queda enlazada por recordId);
//   - salida: se usó o se dañó (a mano o para una actividad, enlazada por actividadId);
//   - ajuste: el conteo físico corrige el stock;
//   - devolucion: lo que sobró en una actividad vuelve a la bodega.
// El stock nunca queda negativo: las salidas descuentan con una condición en la misma escritura (stock >= cantidad),
// así dos personas que sacan a la vez no pueden pasarse de lo que hay.

export const BODEGAS = { bodega: "Bodega", sst: "SST", aseo: "Desechables y aseo" };
const TIPOS = ["entrada", "salida", "ajuste"];

function badRequest(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

const diasPara = (iso) => (iso ? Math.round((new Date(`${iso}T00:00:00Z`) - new Date(`${hoyColombia()}T00:00:00Z`)) / 86400000) : null);

export function toClientArticulo(a, sumas) {
  const dias = diasPara(a.vence);
  return {
    id: a.id, bodega: a.bodega, bodegaNombre: BODEGAS[a.bodega] || a.bodega, referencia: a.referencia, producto: a.producto,
    unidad: a.unidad, minimo: a.minimo, vence: a.vence, diasParaVencer: dias, stock: a.stock, activo: a.activo,
    faltan: a.minimo != null && a.stock < a.minimo ? a.minimo - a.stock : 0,
    entradas: sumas?.entradas ?? 0, salidas: sumas?.salidas ?? 0, inicial: sumas?.inicial ?? 0,
    createdAt: a.createdAt, creadoPorNombre: a.creadoPorNombre,
  };
}

const entero = (v, etiqueta, { min = 0, obligatorio = true } = {}) => {
  if (v === "" || v === null || v === undefined) {
    if (obligatorio) throw badRequest(`${etiqueta} es obligatoria.`);
    return null;
  }
  const n = Number(v);
  if (!Number.isInteger(n) || n < min) throw badRequest(`${etiqueta} debe ser un número entero${min > 0 ? " mayor que cero" : ", cero o mayor"}.`);
  return n;
};

function leerArticulo(body, { parcial = false } = {}) {
  const data = {};
  const viene = (k) => !parcial || k in body;
  if (viene("producto")) {
    data.producto = String(body.producto ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
    if (!data.producto) throw badRequest("Escribe el nombre del artículo.");
  }
  if (viene("bodega")) {
    data.bodega = String(body.bodega || "bodega");
    if (!BODEGAS[data.bodega]) throw badRequest(`Bodega inválida. Opciones: ${Object.values(BODEGAS).join(", ")}.`);
  }
  if (viene("referencia")) data.referencia = String(body.referencia ?? "").trim().slice(0, 60) || null;
  if (viene("unidad")) data.unidad = String(body.unidad ?? "").trim().slice(0, 40) || "Unidad";
  if (viene("minimo")) data.minimo = entero(body.minimo, "El mínimo", { obligatorio: false });
  if (viene("vence")) {
    const v = body.vence ? String(body.vence) : null;
    if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw badRequest("La fecha de vencimiento debe ser aaaa-mm-dd.");
    data.vence = v;
  }
  if (!parcial || "activo" in body) data.activo = body.activo !== false;
  return data;
}

async function sumasPorArticulo(ids) {
  const filas = await prisma.movimientoInventario.groupBy({ by: ["articuloId", "tipo"], where: { articuloId: { in: ids } }, _sum: { cantidad: true } });
  const out = new Map();
  for (const f of filas) {
    const s = out.get(f.articuloId) || { inicial: 0, entradas: 0, salidas: 0 };
    const c = f._sum.cantidad || 0;
    if (f.tipo === "inicial") s.inicial += c;
    else if (f.tipo === "entrada" || f.tipo === "devolucion") s.entradas += c;
    else if (f.tipo === "salida") s.salidas += -c;
    out.set(f.articuloId, s);
  }
  return out;
}

export async function listArticulos({ soloActivos = false } = {}) {
  const rows = await prisma.articuloInventario.findMany({ where: soloActivos ? { activo: true } : {}, orderBy: [{ bodega: "asc" }, { producto: "asc" }, { vence: "asc" }] });
  const sumas = await sumasPorArticulo(rows.map((r) => r.id));
  return rows.map((r) => toClientArticulo(r, sumas.get(r.id)));
}

async function articuloOError(id, tx = prisma) {
  const a = await tx.articuloInventario.findUnique({ where: { id: Number(id) || 0 } });
  if (!a) throw badRequest("Artículo no encontrado.", 404);
  return a;
}

export async function crearArticulo(body, actor) {
  const data = leerArticulo(body || {});
  const row = await prisma.articuloInventario.create({ data: { ...data, stock: 0, creadoPorUserId: actor?.id || null, creadoPorNombre: actor?.nombre || null } });
  logInventarioBodega(actor, row, "crear", `Nuevo artículo en ${BODEGAS[row.bodega]}${row.minimo != null ? ` · mínimo ${row.minimo}` : ""}${row.vence ? ` · vence ${row.vence}` : ""}`).catch(() => {});
  return toClientArticulo(row);
}

export async function editarArticulo(id, body, actor) {
  const before = await articuloOError(id);
  const data = leerArticulo(body || {}, { parcial: true });
  delete data.stock; // el stock solo cambia con movimientos
  const row = await prisma.articuloInventario.update({ where: { id: before.id }, data });
  const cambios = ["producto", "bodega", "referencia", "unidad", "minimo", "vence", "activo"]
    .filter((k) => k in data && before[k] !== row[k])
    .map((k) => ({ field: k, before: before[k], after: row[k] }));
  if (cambios.length) logInventarioBodega(actor, row, "editar", null, cambios).catch(() => {});
  return toClientArticulo(row, (await sumasPorArticulo([row.id])).get(row.id));
}

// Un movimiento en una transacción: suma o resta con la condición de no quedar negativo, y deja el registro.
async function mover(tx, articuloId, { tipo, delta, motivo, recordId = null, actividadId = null, inventarioActividadId = null }, actor) {
  const a = await articuloOError(articuloId, tx);
  if (delta < 0) {
    const r = await tx.articuloInventario.updateMany({ where: { id: a.id, stock: { gte: -delta } }, data: { stock: { decrement: -delta } } });
    if (!r.count) {
      const actual = await articuloOError(articuloId, tx);
      throw badRequest(`No hay suficiente ${actual.producto.toLowerCase()}: hay ${actual.stock} y se pidieron ${-delta}.`, 409);
    }
  } else if (delta > 0) {
    await tx.articuloInventario.update({ where: { id: a.id }, data: { stock: { increment: delta } } });
  }
  const despues = await articuloOError(articuloId, tx);
  const mov = await tx.movimientoInventario.create({
    data: {
      articuloId: a.id, tipo, cantidad: delta, stockAntes: despues.stock - delta, stockDespues: despues.stock,
      motivo: motivo ? String(motivo).trim().slice(0, 300) : null, recordId, actividadId, inventarioActividadId,
      creadoPorUserId: actor?.id || null, creadoPorNombre: actor?.nombre || null,
    },
  });
  return { articulo: despues, movimiento: mov };
}

const ETIQUETA = { entrada: "Entrada", salida: "Salida", ajuste: "Ajuste por conteo", devolucion: "Devolución", inicial: "Saldo inicial" };
const resumenMov = (m, a) => `${ETIQUETA[m.tipo] || m.tipo} de ${Math.abs(m.cantidad)} ${a.unidad.toLowerCase()} · stock ${m.stockAntes} → ${m.stockDespues}${m.motivo ? ` · ${m.motivo}` : ""}`;

// Movimiento a mano desde el inventario: entrada / salida con una cantidad, o ajuste con lo que se contó.
export async function registrarMovimiento(articuloId, body, actor) {
  const tipo = String(body?.tipo || "");
  if (!TIPOS.includes(tipo)) throw badRequest("Tipo de movimiento inválido: entrada, salida o ajuste.");
  const r = await prisma.$transaction(async (tx) => {
    const a = await articuloOError(articuloId, tx);
    let delta;
    if (tipo === "ajuste") delta = entero(body.conteo, "La cantidad contada") - a.stock;
    else delta = (tipo === "salida" ? -1 : 1) * entero(body.cantidad, "La cantidad", { min: 1 });
    if (tipo === "ajuste" && delta === 0) throw badRequest("El conteo es igual al stock: no hay nada que ajustar.");
    return mover(tx, a.id, { tipo, delta, motivo: body.motivo }, actor);
  });
  logInventarioBodega(actor, r.articulo, tipo, resumenMov(r.movimiento, r.articulo)).catch(() => {});
  return { articulo: toClientArticulo(r.articulo, (await sumasPorArticulo([r.articulo.id])).get(r.articulo.id)), movimiento: r.movimiento };
}

export async function listMovimientos(articuloId) {
  const a = await articuloOError(articuloId);
  const movs = await prisma.movimientoInventario.findMany({
    where: { articuloId: a.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 500,
    include: { record: { select: { localSeq: true, proveedor: true } }, actividad: { select: { id: true, nombre: true, linea: true } } },
  });
  return {
    articulo: toClientArticulo(a, (await sumasPorArticulo([a.id])).get(a.id)),
    movimientos: movs.map((m) => ({
      id: m.id, tipo: m.tipo, cantidad: m.cantidad, stockAntes: m.stockAntes, stockDespues: m.stockDespues, motivo: m.motivo,
      compra: m.recordId ? { id: m.recordId, localSeq: m.record?.localSeq ?? null, proveedor: m.record?.proveedor ?? null } : null,
      actividad: m.actividad ? { id: m.actividad.id, nombre: m.actividad.nombre, linea: m.actividad.linea } : null,
      createdAt: m.createdAt, creadoPorNombre: m.creadoPorNombre,
    })),
  };
}

// ---------- Desde Compras: lo que entra a la bodega con una compra ----------
export async function entradasDeCompra(recordId) {
  const movs = await prisma.movimientoInventario.findMany({ where: { recordId: String(recordId) }, orderBy: { createdAt: "asc" }, include: { articulo: true } });
  return movs.map((m) => ({ id: m.id, cantidad: m.cantidad, createdAt: m.createdAt, creadoPorNombre: m.creadoPorNombre, articulo: toClientArticulo(m.articulo) }));
}

export async function entradaPorCompra(recordId, body, actor) {
  const record = await prisma.record.findUnique({ where: { id: String(recordId) }, select: { id: true, localSeq: true, proveedor: true } });
  if (!record) throw badRequest("La compra no existe.", 404);
  const cantidad = entero(body?.cantidad, "La cantidad que llegó", { min: 1 });
  const r = await prisma.$transaction((tx) => mover(tx, body?.articuloId, {
    tipo: "entrada", delta: cantidad, recordId: record.id,
    motivo: `Compra #${record.localSeq ?? "—"}${record.proveedor ? ` (${record.proveedor})` : ""}`,
  }, actor));
  logInventarioBodega(actor, r.articulo, "entrada", resumenMov(r.movimiento, r.articulo)).catch(() => {});
  return { articulo: toClientArticulo(r.articulo), movimiento: r.movimiento };
}

// ---------- Desde una actividad: sacar de la bodega y devolver lo que sobró ----------
async function actividadEditable(id) {
  const a = await prisma.actividadBienestar.findUnique({ where: { id: Number(id) || 0 } });
  if (!a) throw badRequest("Actividad no encontrada.", 404);
  if (a.estado === "cerrada") throw badRequest("La actividad está cerrada: ya no se puede modificar.", 409);
  return a;
}

// Saca de la bodega para la actividad: descuenta el stock (nunca más de lo que hay) y crea —o suma a— la fila del
// inventario de la actividad, enlazada al artículo, con el costo unitario que se indique.
export async function salidaParaActividad(actividadId, body, actor) {
  const act = await actividadEditable(actividadId);
  const cantidad = entero(body?.cantidad, "La cantidad", { min: 1 });
  const costo = body?.costoUnitario === "" || body?.costoUnitario == null ? null : Number(body.costoUnitario);
  if (costo != null && (!Number.isFinite(costo) || costo < 0)) throw badRequest("El costo unitario debe ser un número, cero o mayor.");
  const r = await prisma.$transaction(async (tx) => {
    const art = await articuloOError(body?.articuloId, tx);
    if (!art.activo) throw badRequest("Ese artículo está inactivo en la bodega.");
    const existente = await tx.inventarioActividad.findFirst({ where: { actividadId: act.id, articuloId: art.id } });
    const fila = existente
      ? await tx.inventarioActividad.update({ where: { id: existente.id }, data: { cantidad: existente.cantidad + cantidad, usado: existente.cantidad + cantidad, ...(costo != null ? { costoUnitario: costo } : {}) } })
      : await tx.inventarioActividad.create({ data: { actividadId: act.id, articuloId: art.id, item: art.producto, unidad: art.unidad, cantidad, usado: cantidad, costoUnitario: costo, observacion: "Usado de la bodega de Bienestar", creadoPorUserId: actor?.id || null, creadoPorNombre: actor?.nombre || null } });
    const m = await mover(tx, art.id, { tipo: "salida", delta: -cantidad, actividadId: act.id, inventarioActividadId: fila.id, motivo: `Usado en la actividad «${act.nombre}»` }, actor);
    return { ...m, fila };
  });
  logInventarioBodega(actor, r.articulo, "salida", resumenMov(r.movimiento, r.articulo)).catch(() => {});
  return { articulo: toClientArticulo(r.articulo), item: r.fila };
}

// Corrige cuánto se usó de un artículo de la bodega («Editar cantidad usada» de la ficha). Lo que sale de la bodega es lo
// usado (cantidad = usado, no se estima antes): si sube, la diferencia sale de la bodega (nunca más de lo que hay, 409);
// si baja, la diferencia vuelve a la bodega.
export async function ajustarCantidadDeBodega(actividadId, body, actor) {
  const act = await actividadEditable(actividadId);
  const nueva = entero(body?.cantidad, "La cantidad", { min: 1 });
  const r = await prisma.$transaction(async (tx) => {
    const fila = await tx.inventarioActividad.findFirst({ where: { id: Number(body?.itemId) || 0, actividadId: act.id } });
    if (!fila) throw badRequest("Ese ítem no es de esta actividad.", 404);
    if (!fila.articuloId) throw badRequest("Ese ítem no salió de la bodega.");
    const delta = nueva - fila.cantidad;
    if (delta === 0 && fila.usado === nueva) return { sinCambio: true, fila };
    const actualizada = await tx.inventarioActividad.update({ where: { id: fila.id }, data: { cantidad: nueva, usado: nueva } });
    if (delta === 0) return { sinCambio: true, fila: actualizada };
    if (delta > 0) {
      const art = await tx.articuloInventario.findUnique({ where: { id: fila.articuloId }, select: { producto: true, stock: true } });
      if (art && delta > art.stock) throw Object.assign(new Error(`No hay suficiente ${art.producto.toLowerCase()}: en la bodega quedan ${art.stock}, así que lo usado puede subir hasta ${fila.cantidad + art.stock}.`), { status: 409 });
    }
    const m = delta > 0
      ? await mover(tx, fila.articuloId, { tipo: "salida", delta: -delta, actividadId: act.id, inventarioActividadId: fila.id, motivo: `Se usó más en la actividad «${act.nombre}» (${fila.cantidad} → ${nueva})` }, actor)
      : await mover(tx, fila.articuloId, { tipo: "devolucion", delta: -delta, actividadId: act.id, inventarioActividadId: fila.id, motivo: `Se usó menos en la actividad «${act.nombre}» (${fila.cantidad} → ${nueva})` }, actor);
    return { ...m, fila: actualizada };
  });
  if (r.sinCambio) return { item: r.fila, articulo: null };
  logInventarioBodega(actor, r.articulo, r.movimiento.tipo, resumenMov(r.movimiento, r.articulo)).catch(() => {});
  return { articulo: toClientArticulo(r.articulo), item: r.fila };
}

// Devuelve a la bodega parte de lo que se sacó para la actividad (lo que sobró).
export async function devolverABodega(actividadId, body, actor) {
  const act = await actividadEditable(actividadId);
  const cantidad = entero(body?.cantidad, "La cantidad a devolver", { min: 1 });
  const r = await prisma.$transaction(async (tx) => {
    const fila = await tx.inventarioActividad.findFirst({ where: { id: Number(body?.itemId) || 0, actividadId: act.id } });
    if (!fila) throw badRequest("Ese ítem no es de esta actividad.", 404);
    if (!fila.articuloId) throw badRequest("Ese ítem no salió de la bodega: no hay a dónde devolverlo.");
    const usado = fila.usado ?? 0;
    const puede = fila.cantidad - usado;
    if (cantidad > puede) throw badRequest(`Solo se pueden devolver ${puede}: se sacaron ${fila.cantidad} y se usaron ${usado}.`);
    const actualizada = await tx.inventarioActividad.update({ where: { id: fila.id }, data: { cantidad: fila.cantidad - cantidad } });
    const m = await mover(tx, fila.articuloId, { tipo: "devolucion", delta: cantidad, actividadId: act.id, inventarioActividadId: fila.id, motivo: body?.motivo || `Sobró en la actividad «${act.nombre}»` }, actor);
    return { ...m, fila: actualizada };
  });
  logInventarioBodega(actor, r.articulo, "devolucion", resumenMov(r.movimiento, r.articulo)).catch(() => {});
  return { articulo: toClientArticulo(r.articulo), item: r.fila };
}
