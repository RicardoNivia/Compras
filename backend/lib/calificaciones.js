import { prisma } from "@/lib/prisma";
import { logCalificacionUpsert } from "@/lib/audit";
import { publicarEvento, datosCompra } from "@/lib/notificacionesEventos";

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

export function toClientCalificacion(c) {
  if (!c) return null;
  return {
    id: c.id,
    recordId: c.recordId,
    proveedorNit: c.proveedorNit,
    proveedor: c.proveedor,
    estrellas: c.estrellas,
    causasIds: c.causasIds ? JSON.parse(c.causasIds) : [],
    comentario: c.comentario,
    calificadoPorUserId: c.calificadoPorUserId,
    calificadoPorNombre: c.calificadoPorNombre,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

export async function getCalificacionByRecordId(recordId) {
  const row = await prisma.calificacionProveedor.findUnique({ where: { recordId } });
  return toClientCalificacion(row);
}

// Una sola calificación por registro (upsert por recordId) — se puede
// recalificar en cualquier momento, como en Uber/Rappi. Si estrellas < 5,
// exige al menos una causa del maestro tipo="causaCalificacion" cuyo
// aplicaEstrellas coincida EXACTO con las estrellas dadas (ver
// Maestro.aplicaEstrellas, lib/maestros.js).
export async function upsertCalificacion(recordId, body, actor) {
  const record = await prisma.record.findUnique({ where: { id: recordId } });
  if (!record) {
    const err = new Error("Registro no encontrado.");
    err.status = 404;
    throw err;
  }
  if (!record.proveedorNit) {
    throw badRequest("Este registro no tiene un proveedor asociado del catálogo, no se puede calificar.");
  }

  const estrellas = Number(body.estrellas);
  if (!Number.isInteger(estrellas) || estrellas < 1 || estrellas > 5) {
    throw badRequest("Selecciona de 1 a 5 estrellas.");
  }

  let causasIds = [];
  if (estrellas < 5) {
    causasIds = Array.isArray(body.causasIds) ? [...new Set(body.causasIds.filter(Boolean))] : [];
    if (!causasIds.length) {
      throw badRequest("Selecciona al menos una causa de la calificación.");
    }
    const causas = await prisma.maestro.findMany({ where: { id: { in: causasIds } } });
    if (causas.length !== causasIds.length) {
      throw badRequest("Alguna de las causas seleccionadas no existe.");
    }
    const invalida = causas.find(
      (c) => c.tipo !== "causaCalificacion" || !c.activo || c.aplicaEstrellas !== estrellas
    );
    if (invalida) {
      throw badRequest(`La causa "${invalida.valor}" no aplica para una calificación de ${estrellas} estrella(s).`);
    }
  }

  const comentario = body.comentario ? String(body.comentario).slice(0, 2000) : null;

  const before = toClientCalificacion(await prisma.calificacionProveedor.findUnique({ where: { recordId } }));

  const data = {
    recordId,
    proveedorNit: record.proveedorNit,
    proveedor: record.proveedor,
    estrellas,
    causasIds: causasIds.length ? JSON.stringify(causasIds) : null,
    comentario,
    calificadoPorUserId: actor?.id || null,
    calificadoPorNombre: actor?.nombre || null,
  };

  const row = await prisma.calificacionProveedor.upsert({
    where: { recordId },
    update: data,
    create: data,
  });

  const after = toClientCalificacion(row);
  await logCalificacionUpsert(actor, before, after).catch(() => {});
  // Notificaciones por evento (fire-and-forget).
  publicarEvento("compra.calificada", {
    entidadId: recordId,
    clave: `compra.calificada|${recordId}|${row.updatedAt.toISOString()}`,
    datos: { ...datosCompra(record), estrellas, comentario, calificadoPor: actor?.nombre || null },
    actor,
  });
  return after;
}
