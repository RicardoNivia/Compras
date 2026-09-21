import { prisma } from "@/lib/prisma";

// Mapea un registro de Prisma (SQLite) al shape que usa el front (igual al original).
export function toClientRecord(r) {
  return {
    id: r.id,
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

export async function createRecord(body) {
  const data = sanitizeInput(body);
  if (!data.fechaSolicitud || !data.area || !data.responsable || !data.descripcion) {
    const err = new Error("Completa fecha de solicitud, área, responsable y descripción.");
    err.status = 400;
    throw err;
  }
  const row = await prisma.record.create({ data });
  await prisma.meta.update({ where: { id: 1 }, data: { nextLocalSeq: { increment: 1 } } }).catch(() => {});
  return toClientRecord(row);
}

export async function updateRecord(id, body) {
  const data = sanitizeInput(body);
  const row = await prisma.record.update({ where: { id }, data });
  return toClientRecord(row);
}

export async function patchRecord(id, partial) {
  const row = await prisma.record.update({ where: { id }, data: partial });
  return toClientRecord(row);
}

export async function deleteRecord(id) {
  await prisma.record.delete({ where: { id } });
}
