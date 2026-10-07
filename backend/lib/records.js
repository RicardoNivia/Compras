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
    nit: r.nit,
    proveedor: r.proveedor,
    fe: r.fe,
    valorConIva: r.valorConIva,
    valorSinIva: r.valorSinIva,
    valorCot: r.valorCot,
    moneda: r.moneda || "COP",
    valorUsd: r.valorUsd,
    trm: r.trm,
    observaciones: r.observaciones,
    radicado: r.radicado,
    // Capturada por el servidor al crear el registro (Prisma @default(now()),
    // nunca editable desde el cliente — ver FIELD_SANITIZERS, que no la
    // incluye) — distinta de "fechaSolicitud", que el usuario puede editar o
    // dejar con una fecha pasada.
    fechaRegistro: r.createdAt,
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

// Tope de tamaño para campos de texto libre — evita que un payload gigante
// (abuso de almacenamiento, por error o intencional) se guarde tal cual; no
// es una medida contra inyección (Prisma ya parametriza las queries).
function textOrNull(maxLength) {
  return (v) => {
    if (!v) return null;
    const s = String(v);
    return s.length > maxLength ? s.slice(0, maxLength) : s;
  };
}

const FIELD_SANITIZERS = {
  informe: textOrNull(100),
  fechaSolicitud: (v) => v || null,
  fechaEntrega: (v) => v || null,
  area: textOrNull(100),
  responsable: textOrNull(150),
  estado: textOrNull(100),
  categoria: textOrNull(100),
  descripcion: textOrNull(2000),
  medioPago: textOrNull(100),
  licitacion: textOrNull(100),
  estadoLegalizacion: textOrNull(100),
  // Sin dígito de verificación (se valida/normaliza en el formulario, no aquí).
  nit: textOrNull(20),
  proveedor: textOrNull(200),
  fe: textOrNull(100),
  valorConIva: numOrNull,
  valorSinIva: numOrNull,
  valorCot: numOrNull,
  moneda: (v) => (v === "USD" ? "USD" : "COP"),
  valorUsd: numOrNull,
  trm: numOrNull,
  observaciones: textOrNull(4000),
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

// El número de factura/referencia (fe) puede repetirse (p.ej. una misma
// factura cubre varias compras): esto NUNCA bloquea el guardado, solo se usa
// para devolver un aviso informativo al cliente (ver "feWarning" abajo).
async function countOtrosConFe(fe, excludeId) {
  if (!fe) return 0;
  return prisma.record.count({ where: { fe, id: excludeId ? { not: excludeId } : undefined } });
}

export async function createRecord(body, actor) {
  const data = sanitizeInput(body);
  if (!data.fechaSolicitud || !data.area || !data.responsable || !data.descripcion) {
    const err = new Error("Completa fecha de solicitud, área, responsable y descripción.");
    err.status = 400;
    throw err;
  }
  const feDuplicados = await countOtrosConFe(data.fe, null);
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
  if (feDuplicados > 0) {
    record.feWarning = `Ya existen ${feDuplicados} compra(s) registradas con el número de factura/referencia "${data.fe}".`;
  }
  return record;
}

// options.fields restringe qué campos puede tocar esta edición (p.ej. legalizar);
// omitirlo sanea el registro completo (admin, registro).
export async function updateRecord(id, body, actor, options = {}) {
  const before = await prisma.record.findUnique({ where: { id } });
  const data = options.fields ? sanitizeFields(body, options.fields) : sanitizeInput(body);
  const feDuplicados = "fe" in data ? await countOtrosConFe(data.fe, id) : 0;
  const row = await prisma.record.update({ where: { id }, data });
  const after = toClientRecord(row);
  await logUpdate(actor, before ? toClientRecord(before) : null, after, "editar").catch(() => {});
  if (feDuplicados > 0) {
    after.feWarning = `Ya existen ${feDuplicados} compra(s) registradas con el número de factura/referencia "${data.fe}".`;
  }
  return after;
}

export async function patchRecord(id, rawPartial, actor, options = {}) {
  const before = await prisma.record.findUnique({ where: { id } });
  const partial = options.fields
    ? Object.fromEntries(Object.entries(rawPartial).filter(([k]) => options.fields.includes(k)))
    : rawPartial;
  // El radicado es una acción de un solo sentido: una vez marcado, nadie
  // (ni admin) puede desmarcarlo — se refuerza aquí, no solo en la UI.
  if (before?.radicado && partial.radicado === false) {
    const err = new Error("No se puede desmarcar el radicado: una vez marcado no se puede deshacer.");
    err.status = 409;
    throw err;
  }
  // Solo se puede radicar un registro cuya legalización ya esté en estado "Legalizado".
  if (partial.radicado === true) {
    const estadoLegalizacion = partial.estadoLegalizacion !== undefined ? partial.estadoLegalizacion : before?.estadoLegalizacion;
    if (estadoLegalizacion !== "Legalizado") {
      const err = new Error("Solo se puede radicar un registro con estado de legalización \"Legalizado\".");
      err.status = 409;
      throw err;
    }
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
