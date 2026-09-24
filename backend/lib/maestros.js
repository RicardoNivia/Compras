import { prisma } from "@/lib/prisma";
import { logMaestroCreate, logMaestroUpdate, logMaestroDelete } from "@/lib/audit";

// tipo -> nombre del campo correspondiente en Record (coinciden 1:1).
// Duplicado (sin Prisma) en frontend/lib/maestrosTipos.js — mantener ambos en sync.
export const TIPOS_MAESTRO = ["area", "responsable", "estado", "medioPago", "estadoLegalizacion"];

export const TIPO_LABELS = {
  area: "Área",
  responsable: "Responsable",
  estado: "Estado de compra",
  medioPago: "Medio de pago",
  estadoLegalizacion: "Estado legalización",
};

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

export function toClientMaestro(m, enUso = false) {
  return {
    id: m.id,
    tipo: m.tipo,
    valor: m.valor,
    activo: m.activo,
    enUso,
    createdAt: m.createdAt,
  };
}

export async function isValueInUse(tipo, valor) {
  const count = await prisma.record.count({ where: { [tipo]: valor } });
  return count > 0;
}

// Devuelve, por tipo, el conjunto de valores realmente usados hoy en registros
// (una sola consulta por tipo en vez de N+1 por fila).
async function usedValuesByTipo(tipo) {
  const rows = await prisma.record.findMany({
    where: { [tipo]: { not: null } },
    select: { [tipo]: true },
    distinct: [tipo],
  });
  return new Set(rows.map((r) => r[tipo]).filter((v) => v !== null && v !== ""));
}

export async function listMaestros({ tipo, onlyActive } = {}) {
  if (tipo && !TIPOS_MAESTRO.includes(tipo)) throw badRequest("Tipo de maestro inválido.");

  const where = {};
  if (tipo) where.tipo = tipo;
  if (onlyActive) where.activo = true;

  const rows = await prisma.maestro.findMany({ where, orderBy: [{ tipo: "asc" }, { valor: "asc" }] });

  const usedCache = new Map();
  const out = [];
  for (const row of rows) {
    if (!usedCache.has(row.tipo)) usedCache.set(row.tipo, await usedValuesByTipo(row.tipo));
    out.push(toClientMaestro(row, usedCache.get(row.tipo).has(row.valor)));
  }
  return out;
}

export async function createMaestro(body, actor) {
  const tipo = body.tipo;
  const valor = (body.valor || "").trim();
  if (!TIPOS_MAESTRO.includes(tipo)) throw badRequest("Tipo de maestro inválido.");
  if (!valor) throw badRequest("El valor es obligatorio.");

  try {
    const row = await prisma.maestro.create({
      data: { tipo, valor, activo: body.activo ?? true },
    });
    const maestro = toClientMaestro(row, false);
    await logMaestroCreate(actor, maestro).catch(() => {});
    return maestro;
  } catch (err) {
    if (err.code === "P2002") throw badRequest("Ya existe ese valor para este maestro.");
    throw err;
  }
}

export async function updateMaestro(id, body, actor) {
  const current = await prisma.maestro.findUnique({ where: { id } });
  if (!current) {
    const err = new Error("Maestro no encontrado.");
    err.status = 404;
    throw err;
  }

  const data = {};
  if (body.activo !== undefined) data.activo = !!body.activo;

  if (body.valor !== undefined) {
    const valor = String(body.valor).trim();
    if (!valor) throw badRequest("El valor es obligatorio.");
    if (valor !== current.valor) {
      if (await isValueInUse(current.tipo, current.valor)) {
        const err = new Error("No se puede editar: este valor ya está en uso en registros existentes.");
        err.status = 409;
        throw err;
      }
      data.valor = valor;
    }
  }

  try {
    const row = await prisma.maestro.update({ where: { id }, data });
    const after = toClientMaestro(row, await isValueInUse(row.tipo, row.valor));
    await logMaestroUpdate(actor, toClientMaestro(current, false), after).catch(() => {});
    return after;
  } catch (err) {
    if (err.code === "P2002") throw badRequest("Ya existe ese valor para este maestro.");
    throw err;
  }
}

export async function deleteMaestro(id, actor) {
  const current = await prisma.maestro.findUnique({ where: { id } });
  if (!current) {
    const err = new Error("Maestro no encontrado.");
    err.status = 404;
    throw err;
  }
  if (await isValueInUse(current.tipo, current.valor)) {
    const err = new Error("No se puede eliminar: este valor ya está en uso en registros existentes.");
    err.status = 409;
    throw err;
  }
  await prisma.maestro.delete({ where: { id } });
  await logMaestroDelete(actor, toClientMaestro(current, false)).catch(() => {});
}
