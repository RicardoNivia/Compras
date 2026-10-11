import { prisma } from "@/lib/prisma";
import { logMaestroCreate, logMaestroUpdate, logMaestroDelete } from "@/lib/audit";

// tipo -> nombre del campo correspondiente en Record (coinciden 1:1).
// "causaCalificacion" es la excepción: no referencia un campo de Record, sino
// CalificacionProveedor.causasIds (N:M por id, ver lib/calificaciones.js).
// Duplicado (sin Prisma) en frontend/lib/maestrosTipos.js — mantener ambos en sync.
export const TIPOS_MAESTRO = ["area", "responsable", "estado", "categoria", "medioPago", "estadoLegalizacion", "causaCalificacion", "motivoExcepcion"];

export const TIPO_LABELS = {
  area: "Área",
  responsable: "Responsable",
  estado: "Estado de compra",
  categoria: "Categoría",
  medioPago: "Medio de pago",
  estadoLegalizacion: "Estado legalización",
  causaCalificacion: "Causa de calificación",
  motivoExcepcion: "Motivo de excepción de proveedor",
};

// Estrellas (1..4) a las que puede aplicar una causa de calificación —
// 5 estrellas nunca requiere causa, por eso no está en esta lista.
export const ESTRELLAS_CON_CAUSA = [1, 2, 3, 4];

// tipo -> campo de Record que guarda la referencia real (el id de esta fila
// de Maestro) — "responsable" no tiene equivalente acá porque Record
// referencia directo al User (responsableUserId), no a la fila de Maestro.
const CAMPO_ID_POR_TIPO = {
  area: "areaId",
  estado: "estadoId",
  categoria: "categoriaId",
  medioPago: "medioPagoId",
  estadoLegalizacion: "estadoLegalizacionId",
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
    userId: m.userId,
    aplicaEstrellas: m.aplicaEstrellas,
    activo: m.activo,
    enUso,
    createdAt: m.createdAt,
  };
}

// El maestro "responsable" no acepta texto libre: cada valor debe venir de un
// usuario real de la aplicación (ver lib/records.js#requireResponsableDelCatalogo,
// que exige que el registro quede atado al mismo userId). El "valor" se toma
// siempre del nombre ACTUAL del usuario — nunca el que mande el cliente.
async function resolveResponsableUser(userId) {
  if (!userId) throw badRequest("Selecciona un usuario de la aplicación.");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw badRequest("Usuario no encontrado.");
  return user;
}

// "En uso" se mide por REFERENCIA, no por texto: para los maestros genéricos
// (area/estado/categoria/medioPago/estadoLegalizacion) un registro cuenta si
// su campo "<tipo>Id" apunta al id de esta fila; para "responsable", si algún
// registro tiene ese mismo userId en responsableUserId. Por eso renombrar el
// "valor" de un maestro (salvo responsable, que es un caso distinto) nunca
// rompe nada: el id nunca cambia, así que ya no hace falta bloquear la
// edición cuando está en uso — solo bloquear eliminar.

// Ids de causa usados en CalificacionProveedor.causasIds (JSON: string[]) —
// no es un campo <tipo>Id simple como el resto de maestros porque una
// calificación puede tener VARIAS causas (N:M), así que hay que leerlas todas
// y parsear el JSON en memoria.
async function usedCausaIds() {
  const rows = await prisma.calificacionProveedor.findMany({
    where: { causasIds: { not: null } },
    select: { causasIds: true },
  });
  const set = new Set();
  for (const row of rows) {
    try {
      const ids = JSON.parse(row.causasIds || "[]");
      if (Array.isArray(ids)) ids.forEach((id) => set.add(id));
    } catch {
      // ignorar filas con JSON corrupto
    }
  }
  return set;
}

export async function isMaestroInUse(maestro) {
  if (maestro.tipo === "responsable") {
    if (!maestro.userId) return false;
    return (await prisma.record.count({ where: { responsableUserId: maestro.userId } })) > 0;
  }
  if (maestro.tipo === "causaCalificacion") {
    return (await usedCausaIds()).has(maestro.id);
  }
  if (maestro.tipo === "motivoExcepcion") {
    return (await prisma.proveedor.count({ where: { motivoExcepcionId: maestro.id } })) > 0;
  }
  const idField = CAMPO_ID_POR_TIPO[maestro.tipo];
  if (!idField) return false;
  return (await prisma.record.count({ where: { [idField]: maestro.id } })) > 0;
}

// Devuelve, por tipo, el conjunto de ids realmente usados hoy en registros
// (una sola consulta por tipo en vez de N+1 por fila).
async function usedIdsByTipo(tipo) {
  if (tipo === "causaCalificacion") return usedCausaIds();
  if (tipo === "motivoExcepcion") {
    const rows = await prisma.proveedor.findMany({ where: { motivoExcepcionId: { not: null } }, select: { motivoExcepcionId: true }, distinct: ["motivoExcepcionId"] });
    return new Set(rows.map((r) => r.motivoExcepcionId));
  }
  if (tipo === "responsable") {
    const rows = await prisma.record.findMany({
      where: { responsableUserId: { not: null } },
      select: { responsableUserId: true },
      distinct: ["responsableUserId"],
    });
    return new Set(rows.map((r) => r.responsableUserId));
  }
  const idField = CAMPO_ID_POR_TIPO[tipo];
  if (!idField) return new Set();
  const rows = await prisma.record.findMany({
    where: { [idField]: { not: null } },
    select: { [idField]: true },
    distinct: [idField],
  });
  return new Set(rows.map((r) => r[idField]));
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
    if (!usedCache.has(row.tipo)) usedCache.set(row.tipo, await usedIdsByTipo(row.tipo));
    const idsUsados = usedCache.get(row.tipo);
    const enUso = row.tipo === "responsable" ? (row.userId ? idsUsados.has(row.userId) : false) : idsUsados.has(row.id);
    out.push(toClientMaestro(row, enUso));
  }
  return out;
}

function resolveAplicaEstrellas(tipo, raw) {
  if (tipo !== "causaCalificacion") return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 4) {
    throw badRequest("Selecciona a cuántas estrellas (1 a 4) aplica esta causa.");
  }
  return n;
}

export async function createMaestro(body, actor) {
  const tipo = body.tipo;
  if (!TIPOS_MAESTRO.includes(tipo)) throw badRequest("Tipo de maestro inválido.");

  let valor;
  let userId = null;
  if (tipo === "responsable") {
    const user = await resolveResponsableUser(body.userId);
    userId = user.id;
    valor = user.nombre;
  } else {
    valor = (body.valor || "").trim();
    if (!valor) throw badRequest("El valor es obligatorio.");
  }
  const aplicaEstrellas = resolveAplicaEstrellas(tipo, body.aplicaEstrellas);

  try {
    const row = await prisma.maestro.create({
      data: { tipo, valor, userId, aplicaEstrellas, activo: body.activo ?? true },
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

  const enUsoAntes = await isMaestroInUse(current);
  const data = {};
  if (body.activo !== undefined) data.activo = !!body.activo;

  if (current.tipo === "responsable") {
    // Caso distinto al resto: reasignar a otro usuario SÍ se bloquea si está
    // en uso, porque Record referencia directo al User (responsableUserId),
    // no a esta fila — cambiar el usuario aquí no actualizaría los registros
    // ya atados al usuario anterior, dejaría la info desalineada.
    if (body.userId !== undefined && body.userId !== current.userId) {
      if (enUsoAntes) {
        const err = new Error("No se puede editar: este valor ya está en uso en registros existentes.");
        err.status = 409;
        throw err;
      }
      const user = await resolveResponsableUser(body.userId);
      data.userId = user.id;
      data.valor = user.nombre;
    }
  } else if (current.tipo === "causaCalificacion") {
    // Caso distinto al resto de maestros genéricos (area/estado/categoria/...):
    // una causa de calificación en uso NO se puede renombrar ni reasignar de
    // estrellas, porque cambiaría el significado de calificaciones YA
    // guardadas (a diferencia de area/estado, donde el texto es solo un
    // snapshot que se recalcula al listar — ver CalificacionProveedor, que
    // SÍ guarda el id de la causa de forma permanente). Solo "activo" se
    // puede tocar libremente, en uso o no (ver ToggleSwitch en MaestrosView).
    if ((body.valor !== undefined || body.aplicaEstrellas !== undefined) && enUsoAntes) {
      const err = new Error("No se puede editar: esta causa ya está en uso en una o más calificaciones existentes.");
      err.status = 409;
      throw err;
    }
    if (body.valor !== undefined) {
      const valor = String(body.valor).trim();
      if (!valor) throw badRequest("El valor es obligatorio.");
      data.valor = valor;
    }
    if (body.aplicaEstrellas !== undefined) {
      data.aplicaEstrellas = resolveAplicaEstrellas(current.tipo, body.aplicaEstrellas);
    }
  } else if (body.valor !== undefined) {
    // El valor se puede renombrar libremente, en uso o no — la referencia
    // real es el id de esta fila (Record.<tipo>Id), que nunca cambia. Como
    // los registros leen el valor ACTUAL del maestro al listar (ver
    // hydrateConDatosActuales en lib/records.js), el cambio se refleja solo.
    const valor = String(body.valor).trim();
    if (!valor) throw badRequest("El valor es obligatorio.");
    data.valor = valor;
  }

  try {
    const row = await prisma.maestro.update({ where: { id }, data });
    const after = toClientMaestro(row, await isMaestroInUse(row));
    await logMaestroUpdate(actor, toClientMaestro(current, enUsoAntes), after).catch(() => {});
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
  if (await isMaestroInUse(current)) {
    const err = new Error("No se puede eliminar: este valor ya está en uso en registros existentes.");
    err.status = 409;
    throw err;
  }
  await prisma.maestro.delete({ where: { id } });
  await logMaestroDelete(actor, toClientMaestro(current, false)).catch(() => {});
}
