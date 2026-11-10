import { prisma } from "@/lib/prisma";
import { leerInventarioExcel } from "@/lib/bienestarExcel";
import { logInventario } from "@/lib/audit";
import { unidadDelCatalogo, resolvedoresImportacion } from "@/lib/catalogosBienestar";

// Inventario de una actividad de Bienestar: lo que había (comprado o en bodega), cuánto se usó y cuánto quedó. Con
// el costo unitario se valora el sobrante, que es la pérdida por ausentismo cuando no se reutiliza.

function badRequest(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

export function toClientItem(i) {
  const sobrante = i.usado == null ? null : Math.max(0, i.cantidad - i.usado);
  return {
    id: i.id,
    actividadId: i.actividadId,
    item: i.item,
    unidad: i.unidad,
    cantidad: i.cantidad,
    usado: i.usado,
    sobrante,
    costoUnitario: i.costoUnitario,
    costoTotal: i.costoUnitario != null ? i.costoUnitario * i.cantidad : null,
    costoSobrante: i.costoUnitario != null && sobrante != null ? i.costoUnitario * sobrante : null,
    recordId: i.recordId,
    observacion: i.observacion,
    createdAt: i.createdAt,
    creadoPorNombre: i.creadoPorNombre,
  };
}

async function actividadOError(id) {
  const a = await prisma.actividadBienestar.findUnique({ where: { id: Number(id) } });
  if (!a) throw badRequest("Actividad no encontrada.", 404);
  return a;
}

// Una actividad cerrada ya no se modifica en nada.
async function actividadEditable(id) {
  const a = await actividadOError(id);
  if (a.estado === "cerrada") throw badRequest("La actividad está cerrada: ya no se puede modificar.", 409);
  return a;
}

const num = (v, etiqueta, { obligatorio = false } = {}) => {
  if (v === "" || v === null || v === undefined) {
    if (obligatorio) throw badRequest(`${etiqueta} es obligatorio.`);
    return null;
  }
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw badRequest(`${etiqueta} debe ser un número, cero o mayor.`);
  return n;
};

function leerItem(body, { parcial = false } = {}) {
  const data = {};
  const viene = (k) => !parcial || k in body;
  if (viene("item")) {
    data.item = String(body.item ?? "").trim().slice(0, 200);
    if (!data.item) throw badRequest("Escribe qué es el ítem.");
  }
  if (viene("unidad")) data.unidad = String(body.unidad ?? "").trim().slice(0, 40) || null;
  if (viene("cantidad")) data.cantidad = num(body.cantidad, "La cantidad", { obligatorio: true });
  if (viene("usado")) data.usado = num(body.usado, "Lo usado");
  if (viene("costoUnitario")) data.costoUnitario = num(body.costoUnitario, "El costo unitario");
  if (viene("recordId")) data.recordId = body.recordId ? String(body.recordId) : null;
  if (viene("observacion")) data.observacion = String(body.observacion ?? "").trim().slice(0, 500) || null;
  return data;
}

export async function listInventario(actividadId) {
  const a = await actividadOError(actividadId);
  const rows = await prisma.inventarioActividad.findMany({ where: { actividadId: a.id }, orderBy: { item: "asc" } });
  return rows.map(toClientItem);
}

export async function crearItem(actividadId, body, actor) {
  const a = await actividadEditable(actividadId);
  const data = leerItem(body || {});
  Object.assign(data, await unidadDelCatalogo(data.unidad));
  if (data.usado != null && data.usado > data.cantidad) throw badRequest("Lo usado no puede ser más que la cantidad.");
  const row = await prisma.inventarioActividad.create({ data: { ...data, actividadId: a.id, creadoPorUserId: actor?.id || null, creadoPorNombre: actor?.nombre || null } });
  logInventario(actor, a, "crear", `${row.item}: ${row.cantidad}${row.unidad ? ` ${row.unidad}` : ""}`).catch(() => {});
  return toClientItem(row);
}

export async function actualizarItem(actividadId, id, body, actor) {
  const a = await actividadEditable(actividadId);
  const before = await prisma.inventarioActividad.findFirst({ where: { id: Number(id), actividadId: a.id } });
  if (!before) throw badRequest("Ítem no encontrado.", 404);
  const data = leerItem(body || {}, { parcial: true });
  if ("unidad" in data) Object.assign(data, await unidadDelCatalogo(data.unidad));
  const cantidad = data.cantidad ?? before.cantidad;
  const usado = "usado" in data ? data.usado : before.usado;
  if (usado != null && usado > cantidad) throw badRequest("Lo usado no puede ser más que la cantidad.");
  const row = await prisma.inventarioActividad.update({ where: { id: before.id }, data });
  logInventario(actor, a, "editar", `${row.item}: usado ${row.usado ?? "—"} de ${row.cantidad}`).catch(() => {});
  return toClientItem(row);
}

export async function eliminarItem(actividadId, id, actor) {
  const a = await actividadEditable(actividadId);
  const row = await prisma.inventarioActividad.findFirst({ where: { id: Number(id), actividadId: a.id } });
  if (!row) throw badRequest("Ítem no encontrado.", 404);
  await prisma.inventarioActividad.delete({ where: { id: row.id } });
  logInventario(actor, a, "eliminar", row.item).catch(() => {});
}

// Sube el inventario desde un Excel (Ítem, Cantidad, Unidad, Costo unitario, Usado). Los ítems con el mismo nombre se
// actualizan; los nuevos se agregan.
export async function importarInventario(actividadId, buffer, actor) {
  const a = await actividadEditable(actividadId);
  const filas = leerInventarioExcel(buffer);
  if (!filas.length) throw badRequest("El archivo no trae ítems.");
  const existentes = await prisma.inventarioActividad.findMany({ where: { actividadId: a.id } });
  const porItem = new Map(existentes.map((e) => [e.item.toLowerCase(), e]));
  const cat = await resolvedoresImportacion({ actor });
  let creados = 0, actualizados = 0;
  for (const f of filas) {
    if (f.unidad) Object.assign(f, await cat.unidad(f.unidad));
    const usado = f.usado != null ? Math.min(f.usado, f.cantidad) : null;
    const actual = porItem.get(f.item.toLowerCase());
    if (actual) {
      await prisma.inventarioActividad.update({ where: { id: actual.id }, data: { cantidad: f.cantidad, unidad: f.unidad ?? actual.unidad, unidadId: f.unidadId ?? actual.unidadId, costoUnitario: f.costoUnitario ?? actual.costoUnitario, usado: usado ?? actual.usado } });
      actualizados++;
    } else {
      await prisma.inventarioActividad.create({ data: { actividadId: a.id, item: f.item, cantidad: f.cantidad, unidad: f.unidad, unidadId: f.unidadId || null, costoUnitario: f.costoUnitario, usado, creadoPorUserId: actor?.id || null, creadoPorNombre: actor?.nombre || null } });
      creados++;
    }
  }
  logInventario(actor, a, "importar", `Importó inventario: ${creados} nuevos, ${actualizados} actualizados`).catch(() => {});
  return { creados, actualizados, items: (await listInventario(a.id)) };
}

export function resumenInventario(items) {
  const conCosto = items.filter((i) => i.costoTotal != null);
  return {
    items: items.length,
    costoTotal: conCosto.reduce((s, i) => s + i.costoTotal, 0),
    costoSobrante: items.reduce((s, i) => s + (i.costoSobrante || 0), 0),
    sinRegistrarUso: items.filter((i) => i.usado == null).length,
  };
}
