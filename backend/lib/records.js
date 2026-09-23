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

const FIELD_SANITIZERS = {
  informe: (v) => v || null,
  fechaSolicitud: (v) => v || null,
  fechaEntrega: (v) => v || null,
  area: (v) => v || null,
  responsable: (v) => v || null,
  estado: (v) => v || null,
  categoria: (v) => v || null,
  descripcion: (v) => v || null,
  medioPago: (v) => v || null,
  licitacion: (v) => (v != null && v !== "" ? String(v) : null),
  estadoLegalizacion: (v) => v || null,
  proveedor: (v) => v || null,
  fe: (v) => (v != null && v !== "" ? String(v) : null),
  valorConIva: numOrNull,
  valorSinIva: numOrNull,
  valorCot: numOrNull,
  observaciones: (v) => v || null,
  radicado: (v) => !!v,
};

export function sanitizeInput(body) {
  const out = {};
  for (const key of Object.keys(FIELD_SANITIZERS)) {
    out[key] = FIELD_SANITIZERS[key](body[key]);
  }
  return out;
}

// Igual que sanitizeInput, pero solo para el subconjunto de campos dado —
// usado cuando el rol (p.ej. legalizar) solo puede tocar ciertos campos.
export function sanitizeFields(body, fields) {
  const out = {};
  for (const key of fields) {
    if (key in FIELD_SANITIZERS) out[key] = FIELD_SANITIZERS[key](body[key]);
  }
  return out;
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

// options.fields restringe qué campos puede tocar esta edición (p.ej. legalizar);
// omitirlo sanea el registro completo (admin, registro).
export async function updateRecord(id, body, actor, options = {}) {
  const before = await prisma.record.findUnique({ where: { id } });
  const data = options.fields ? sanitizeFields(body, options.fields) : sanitizeInput(body);
  const row = await prisma.record.update({ where: { id }, data });
  const after = toClientRecord(row);
  await logUpdate(actor, before ? toClientRecord(before) : null, after, "editar").catch(() => {});
  return after;
}

export async function patchRecord(id, partial, actor) {
  const before = await prisma.record.findUnique({ where: { id } });
  // El radicado es una acción de un solo sentido: una vez marcado, nadie
  // (ni admin) puede desmarcarlo — se refuerza aquí, no solo en la UI.
  if (before?.radicado && partial.radicado === false) {
    const err = new Error("No se puede desmarcar el radicado: una vez marcado no se puede deshacer.");
    err.status = 409;
    throw err;
  }
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
