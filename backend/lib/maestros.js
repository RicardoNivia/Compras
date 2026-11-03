import { prisma } from "@/lib/prisma";
import { logMaestroCreate, logMaestroUpdate, logMaestroDelete } from "@/lib/audit";
import { isRoleAllowed } from "@/lib/permissions";
import { ROLES, ROLES_COMPRAS } from "@/lib/roles";

// tipo -> nombre del campo correspondiente en Record (coinciden 1:1).
// "causaCalificacion" es la excepción: no referencia un campo de Record, sino
// CalificacionProveedor.causasIds (N:M por id, ver lib/calificaciones.js).
// areaProveedor / tipoProveedor / clasificacionMonto / tipoServicio /
// motivoExcepcion los usa Proveedor (ver USOS_POR_TIPO y MODULO_POR_TIPO).
// Duplicado (sin Prisma) en frontend/lib/maestrosTipos.js — mantener ambos en sync.
export const TIPOS_MAESTRO = ["area", "responsable", "estado", "categoria", "medioPago", "estadoLegalizacion", "causaCalificacion", "areaProveedor", "tipoProveedor", "clasificacionMonto", "tipoServicio", "motivoExcepcion", "responsableBienestar", "areaParticipante", "motivoInasistencia", "unidadInventario", "escalaCalificacion"];

export const TIPO_LABELS = {
  area: "Área",
  responsable: "Responsable",
  estado: "Estado de compra",
  categoria: "Categoría",
  medioPago: "Medio de pago",
  estadoLegalizacion: "Estado legalización",
  causaCalificacion: "Causa de calificación",
  motivoExcepcion: "Motivo de excepción de proveedor",
  areaProveedor: "Área de proveedor",
  tipoProveedor: "Tipo de proveedor (criticidad)",
  clasificacionMonto: "Clasificación por monto",
  tipoServicio: "Tipo de servicio",
  responsableBienestar: "Responsables de actividades",
  areaParticipante: "Áreas de participantes",
  motivoInasistencia: "Motivos de inasistencia",
  unidadInventario: "Unidades de inventario",
  escalaCalificacion: "Escala de calificación",
};

// Módulo dueño de cada maestro. Las áreas de Compras ("area") y de
// Proveedores ("areaProveedor") son maestros distintos.
export const MODULO_POR_TIPO = {
  area: "Compras",
  responsable: "Compras",
  estado: "Compras",
  categoria: "Compras",
  medioPago: "Compras",
  estadoLegalizacion: "Compras",
  causaCalificacion: "Compras",
  areaProveedor: "Proveedores",
  tipoProveedor: "Proveedores",
  clasificacionMonto: "Proveedores",
  tipoServicio: "Proveedores",
  motivoExcepcion: "Proveedores",
  responsableBienestar: "Bienestar",
  areaParticipante: "Bienestar",
  motivoInasistencia: "Bienestar",
  unidadInventario: "Bienestar",
  escalaCalificacion: "Bienestar",
};

// Maestros cuyo valor es un usuario de la aplicación, no un texto libre.
export const TIPOS_USUARIO = ["responsable", "responsableBienestar"];
// Maestros con filas fijas: solo se les cambia el nombre (la escala de 1 a 5 no gana ni pierde puntos).
export const TIPOS_FIJOS = ["escalaCalificacion"];

// Dónde se usa cada maestro (referencia por id), por módulo.
const USOS_POR_TIPO = {
  area: [{ modelo: "record", campo: "areaId", modulo: "Compras" }],
  areaProveedor: [
    { modelo: "proveedor", campo: "areaId", modulo: "Proveedores" },
    { modelo: "proveedorProceso", campo: "areaId", modulo: "Proveedores" },
  ],
  estado: [{ modelo: "record", campo: "estadoId", modulo: "Compras" }],
  categoria: [{ modelo: "record", campo: "categoriaId", modulo: "Compras" }],
  medioPago: [{ modelo: "record", campo: "medioPagoId", modulo: "Compras" }],
  estadoLegalizacion: [{ modelo: "record", campo: "estadoLegalizacionId", modulo: "Compras" }],
  motivoExcepcion: [{ modelo: "proveedor", campo: "motivoExcepcionId", modulo: "Proveedores" }],
  tipoProveedor: [{ modelo: "proveedor", campo: "tipoProveedorId", modulo: "Proveedores" }],
  clasificacionMonto: [{ modelo: "proveedor", campo: "clasificacionMontoId", modulo: "Proveedores" }],
  areaParticipante: [{ modelo: "participanteActividad", campo: "areaId", modulo: "Bienestar" }],
  motivoInasistencia: [{ modelo: "participanteActividad", campo: "motivoInasistenciaId", modulo: "Bienestar" }],
  unidadInventario: [{ modelo: "inventarioActividad", campo: "unidadId", modulo: "Bienestar" }],
  tipoServicio: [
    { modelo: "proveedor", campo: "tipoServicioId", modulo: "Proveedores" },
    { modelo: "proveedorProceso", campo: "servicioId", modulo: "Proveedores" },
  ],
};

// Regla de integridad para TODOS los maestros (Compras y Proveedores): mientras
// un valor esté en uso en cualquiera de los dos módulos no se puede renombrar
// ni eliminar. Sí se puede inactivar (deja de ofrecerse en los formularios sin
// tocar los datos que ya lo usan).
function errorEnUso(maestro, modulos, accion) {
  const err = new Error(`No se puede ${accion}: "${maestro.valor}" está en uso en ${modulos.join(" y ")}. Puedes inactivarlo para que deje de ofrecerse.`);
  err.status = 409;
  return err;
}

// Estrellas (1..4) a las que puede aplicar una causa de calificación —
// 5 estrellas nunca requiere causa, por eso no está en esta lista.
export const ESTRELLAS_CON_CAUSA = [1, 2, 3, 4];


// Quién administra cada grupo de maestros: los de Proveedores, quien pueda
// editar proveedores (admin y rol Proveedores por defecto); los de Compras, los
// roles de Compras. El acceso a la sección (viewMaestros) lo valida la ruta.
export async function puedeAdministrarTipo(actor, tipo) {
  if (!actor) return false;
  if (MODULO_POR_TIPO[tipo] === "Proveedores") return isRoleAllowed(actor.role, "editProveedores");
  if (MODULO_POR_TIPO[tipo] === "Bienestar") return isRoleAllowed(actor.role, "viewMaestrosBienestar");
  if (ROLES_COMPRAS.includes(actor.role)) return true;
  // Un rol personalizado no está en ROLES_COMPRAS: administra los de Compras si la Matriz le da los maestros.
  return !Object.values(ROLES).includes(actor.role) && isRoleAllowed(actor.role, "viewMaestros");
}

async function exigirModulo(actor, tipo) {
  if (await puedeAdministrarTipo(actor, tipo)) return;
  const err = new Error(`No tienes permiso para administrar los maestros de ${MODULO_POR_TIPO[tipo] || "Compras"}.`);
  err.status = 403;
  throw err;
}

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

export function toClientMaestro(m, enUso = false, usadoEn = []) {
  return {
    id: m.id,
    tipo: m.tipo,
    valor: m.valor,
    userId: m.userId,
    aplicaEstrellas: m.aplicaEstrellas,
    activo: m.activo,
    enUso,
    usadoEn, // módulos donde está en uso: ["Compras"] o ["Proveedores"]
    modulo: MODULO_POR_TIPO[m.tipo] || "Compras",
    creadoPorNombre: m.creadoPorNombre || null,
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

// "En uso" se mide por REFERENCIA, no por texto, en Compras y en Proveedores:
// un registro o proveedor cuenta si su campo "<x>Id" apunta al id de esta fila
// (ver USOS_POR_TIPO); para "responsable", si algún registro tiene ese mismo
// userId en responsableUserId. Un valor en uso no se puede renombrar ni
// eliminar (solo inactivar), en ninguno de los dos módulos.

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

// Módulos (Compras / Proveedores) donde está en uso este maestro.
export async function modulosDondeSeUsa(maestro) {
  if (maestro.tipo === "responsableBienestar") {
    if (!maestro.userId) return [];
    return (await prisma.actividadBienestar.count({ where: { responsableUserId: maestro.userId } })) > 0 ? ["Bienestar"] : [];
  }
  if (maestro.tipo === "responsable") {
    if (!maestro.userId) return [];
    return (await prisma.record.count({ where: { responsableUserId: maestro.userId } })) > 0 ? ["Compras"] : [];
  }
  if (maestro.tipo === "causaCalificacion") {
    return (await usedCausaIds()).has(maestro.id) ? ["Compras"] : [];
  }
  const modulos = new Set();
  for (const uso of USOS_POR_TIPO[maestro.tipo] || []) {
    if (modulos.has(uso.modulo)) continue;
    if ((await prisma[uso.modelo].count({ where: { [uso.campo]: maestro.id } })) > 0) modulos.add(uso.modulo);
  }
  return [...modulos];
}

export async function isMaestroInUse(maestro) {
  return (await modulosDondeSeUsa(maestro)).length > 0;
}

// Devuelve, por tipo, un mapa id -> Set(módulos) de los ids realmente usados hoy
// (una consulta por tabla en vez de N+1 por fila).
async function usedIdsByTipo(tipo) {
  const out = new Map();
  const marcar = (id, modulo) => {
    if (!id) return;
    if (!out.has(id)) out.set(id, new Set());
    out.get(id).add(modulo);
  };
  if (tipo === "causaCalificacion") {
    for (const id of await usedCausaIds()) marcar(id, "Compras");
    return out;
  }
  if (tipo === "responsableBienestar") {
    const rows = await prisma.actividadBienestar.findMany({
      where: { responsableUserId: { not: null } },
      select: { responsableUserId: true },
      distinct: ["responsableUserId"],
    });
    for (const r of rows) marcar(r.responsableUserId, "Bienestar");
    return out;
  }
  if (tipo === "responsable") {
    const rows = await prisma.record.findMany({
      where: { responsableUserId: { not: null } },
      select: { responsableUserId: true },
      distinct: ["responsableUserId"],
    });
    for (const r of rows) marcar(r.responsableUserId, "Compras");
    return out;
  }
  for (const uso of USOS_POR_TIPO[tipo] || []) {
    const rows = await prisma[uso.modelo].findMany({
      where: { [uso.campo]: { not: null } },
      select: { [uso.campo]: true },
      distinct: [uso.campo],
    });
    for (const r of rows) marcar(r[uso.campo], uso.modulo);
  }
  return out;
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
    const clave = TIPOS_USUARIO.includes(row.tipo) ? row.userId : row.id;
    const modulos = clave && idsUsados.has(clave) ? [...idsUsados.get(clave)] : [];
    out.push(toClientMaestro(row, modulos.length > 0, modulos));
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

// "Sistemas de Gestión", "Sistema de Gestion" y "SISTEMA DE GESTIÓN" son el mismo valor: se comparan sin tildes,
// mayúsculas, signos ni la s final de cada palabra. Así no vuelven a aparecer áreas duplicadas (y presupuestos partidos).
export function claveMaestro(valor) {
  return String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").replace(/s\b/g, "").replace(/\s+/g, "");
}
async function exigirNoParecido(tipo, valor, exceptoId = null) {
  const k = claveMaestro(valor);
  const otros = await prisma.maestro.findMany({ where: { tipo, ...(exceptoId ? { id: { not: exceptoId } } : {}) }, select: { valor: true } });
  const igual = otros.find((o) => claveMaestro(o.valor) === k);
  if (igual) throw badRequest(`Ya existe «${igual.valor}» en este maestro (es el mismo escrito de otra forma). Usa ese.`);
}

export async function createMaestro(body, actor) {
  const tipo = body.tipo;
  if (!TIPOS_MAESTRO.includes(tipo)) throw badRequest("Tipo de maestro inválido.");
  await exigirModulo(actor, tipo);
  if (TIPOS_FIJOS.includes(tipo)) throw badRequest("Este maestro tiene valores fijos: solo se les puede cambiar el nombre.");

  let valor;
  let userId = null;
  if (TIPOS_USUARIO.includes(tipo)) {
    const user = await resolveResponsableUser(body.userId);
    userId = user.id;
    valor = user.nombre;
  } else {
    valor = (body.valor || "").trim();
    if (!valor) throw badRequest("El valor es obligatorio.");
    await exigirNoParecido(tipo, valor);
  }
  const aplicaEstrellas = resolveAplicaEstrellas(tipo, body.aplicaEstrellas);

  try {
    const row = await prisma.maestro.create({
      data: { tipo, valor, userId, aplicaEstrellas, activo: body.activo ?? true, creadoPorUserId: actor?.id || null, creadoPorNombre: actor?.nombre || null },
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
  await exigirModulo(actor, current.tipo);

  const modulosAntes = await modulosDondeSeUsa(current);
  const enUsoAntes = modulosAntes.length > 0;
  if (enUsoAntes && body.valor !== undefined && String(body.valor).trim() !== current.valor) {
    throw errorEnUso(current, modulosAntes, "modificar");
  }
  const data = {};
  if (TIPOS_FIJOS.includes(current.tipo) && body.activo === false) throw badRequest("Este maestro tiene valores fijos: no se pueden inactivar.");
  if (body.activo !== undefined) data.activo = !!body.activo;

  if (TIPOS_USUARIO.includes(current.tipo)) {
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
    // Solo se llega aquí si no está en uso (ver errorEnUso arriba).
    const valor = String(body.valor).trim();
    if (!valor) throw badRequest("El valor es obligatorio.");
    if (valor !== current.valor) await exigirNoParecido(current.tipo, valor, current.id);
    data.valor = valor;
  }

  try {
    const row = await prisma.maestro.update({ where: { id }, data });
    const modulosDespues = await modulosDondeSeUsa(row);
    const after = toClientMaestro(row, modulosDespues.length > 0, modulosDespues);
    await logMaestroUpdate(actor, toClientMaestro(current, enUsoAntes, modulosAntes), after).catch(() => {});
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
  await exigirModulo(actor, current.tipo);
  if (TIPOS_FIJOS.includes(current.tipo)) throw badRequest("Este maestro tiene valores fijos: no se pueden eliminar.");
  const modulos = await modulosDondeSeUsa(current);
  if (modulos.length) throw errorEnUso(current, modulos, "eliminar");
  await prisma.maestro.delete({ where: { id } });
  await logMaestroDelete(actor, toClientMaestro(current, false)).catch(() => {});
}
