import { prisma } from "@/lib/prisma";
import { logCreate, logUpdate, logDelete } from "@/lib/audit";

// Mapea un registro de Prisma (SQLite) al shape que usa el front (igual al original).
export function toClientRecord(r) {
  return {
    id: r.id,
    localSeq: r.localSeq,
    informe: r.informe,
    fechaSolicitud: r.fechaSolicitud,
    fechaEntrega: r.fechaEntrega,
    area: r.area,
    responsable: r.responsable,
    estado: r.estado,
    categoria: r.categoria,
    descripcion: r.descripcion,
    medioPago: r.medioPago,
    licitacion: r.licitacion,
    estadoLegalizacion: r.estadoLegalizacion,
    proveedor: r.proveedor,
    fe: r.fe,
    valorConIva: r.valorConIva,
    valorSinIva: r.valorSinIva,
    valorCot: r.valorCot,
    observaciones: r.observaciones,
    radicado: r.radicado,
  };
}

export async function listRecords() {
  const rows = await prisma.record.findMany({ orderBy: { fechaSolicitud: "asc" } });
  return rows.map(toClientRecord);
}

export async function getMeta() {
  const meta = await prisma.meta.findUnique({ where: { id: 1 } });
  return {
    sourceFile: meta?.sourceFile ?? null,
    sourceSheet: meta?.sourceSheet ?? null,
    nextLocalSeq: meta?.nextLocalSeq ?? 1,
    updatedAt: meta?.updatedAt ?? null,
  };
}

function numOrNull(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

export function sanitizeInput(body) {
  return {
    informe: body.informe || null,
    fechaSolicitud: body.fechaSolicitud || null,
    fechaEntrega: body.fechaEntrega || null,
    area: body.area || null,
    responsable: body.responsable || null,
    estado: body.estado || null,
    categoria: body.categoria || null,
    descripcion: body.descripcion || null,
    medioPago: body.medioPago || null,
    licitacion: body.licitacion != null && body.licitacion !== "" ? String(body.licitacion) : null,
    estadoLegalizacion: body.estadoLegalizacion || null,
    proveedor: body.proveedor || null,
    fe: body.fe != null && body.fe !== "" ? String(body.fe) : null,
    valorConIva: numOrNull(body.valorConIva),
    valorSinIva: numOrNull(body.valorSinIva),
    valorCot: numOrNull(body.valorCot),
    observaciones: body.observaciones || null,
    radicado: !!body.radicado,
  };
}

export async function createRecord(body, actor) {
  const data = sanitizeInput(body);
  if (!data.fechaSolicitud || !data.area || !data.responsable || !data.descripcion) {
    const err = new Error("Completa fecha de solicitud, área, responsable y descripción.");
    err.status = 400;
    throw err;
  }
  // Asigna el siguiente número autoincremental visible (localSeq) desde Meta,
  // en la misma transacción para evitar que dos creaciones simultáneas choquen.
  const row = await prisma.$transaction(async (tx) => {
    const meta = await tx.meta.findUnique({ where: { id: 1 } });
    const seq = meta?.nextLocalSeq ?? 1;
    await tx.meta.upsert({
      where: { id: 1 },
      update: { nextLocalSeq: seq + 1 },
      create: { id: 1, nextLocalSeq: seq + 1 },
    });
    return tx.record.create({ data: { ...data, localSeq: seq } });
  });
  const record = toClientRecord(row);
  await logCreate(actor, record).catch(() => {});
  return record;
}

export async function updateRecord(id, body, actor) {
  const before = await prisma.record.findUnique({ where: { id } });
  const data = sanitizeInput(body);
  const row = await prisma.record.update({ where: { id }, data });
  const after = toClientRecord(row);
  await logUpdate(actor, before ? toClientRecord(before) : null, after, "editar").catch(() => {});
  return after;
}

export async function patchRecord(id, partial, actor) {
  const before = await prisma.record.findUnique({ where: { id } });
  const row = await prisma.record.update({ where: { id }, data: partial });
  const after = toClientRecord(row);
  const action = Object.keys(partial).every((k) => k === "radicado") ? "radicar" : "editar";
  await logUpdate(actor, before ? toClientRecord(before) : null, after, action).catch(() => {});
  return after;
}

export async function deleteRecord(id, actor) {
  const before = await prisma.record.findUnique({ where: { id } });
  await prisma.record.delete({ where: { id } });
  if (before) await logDelete(actor, toClientRecord(before)).catch(() => {});
}
