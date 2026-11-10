import { prisma } from "@/lib/prisma";
import { logTesoreria } from "@/lib/audit";
import { NIVELES, accesoDe, badRequest, forbidden, notFound } from "@/lib/tesoreria/comun";

// Quién entra a Tesorería (acceso nominal). Solo quien tiene nivel "firma" administra la lista; mientras la lista está
// vacía, un administrador del panel puede dar el PRIMER acceso (arranque del módulo).

export async function puedeAdministrarAccesos(user) {
  const a = await accesoDe(user.id);
  if (a?.puedeFirmar) return true;
  return user.role === "admin" && (await prisma.accesoTesoreria.count()) === 0;
}

export async function listAccesos() {
  const filas = await prisma.accesoTesoreria.findMany({ orderBy: { userNombre: "asc" } });
  return filas.map((a) => ({ id: a.id, userId: a.userId, nombre: a.userNombre, nivel: a.nivel, createdAt: a.createdAt, creadoPorNombre: a.creadoPorNombre }));
}

export async function personasDisponibles() {
  const conAcceso = new Set((await prisma.accesoTesoreria.findMany({ select: { userId: true } })).map((a) => a.userId));
  const users = await prisma.user.findMany({ where: { activo: true }, select: { id: true, nombre: true, email: true }, orderBy: { nombre: "asc" } });
  return users.filter((u) => !conAcceso.has(u.id));
}

export async function otorgarAcceso(actor, { userId, nivel }) {
  if (!(await puedeAdministrarAccesos(actor))) throw forbidden("Solo quien firma en Tesorería administra los accesos.");
  if (!NIVELES.includes(nivel)) throw badRequest("Nivel inválido: consulta, registro o firma.");
  const u = await prisma.user.findUnique({ where: { id: String(userId || "") }, select: { id: true, nombre: true, activo: true } });
  if (!u || !u.activo) throw badRequest("Elige una persona activa del panel.");
  const antes = await prisma.accesoTesoreria.findUnique({ where: { userId: u.id } });
  // El primer acceso del arranque tiene que ser de firma: si no, nadie podría administrar después.
  if (!antes && (await prisma.accesoTesoreria.count()) === 0 && nivel !== "firma") throw badRequest("El primer acceso debe ser de firma, para que alguien pueda administrar el módulo.");
  if (antes && antes.nivel === "firma" && nivel !== "firma") await exigirOtroFirmante(u.id);
  const fila = antes
    ? await prisma.accesoTesoreria.update({ where: { id: antes.id }, data: { nivel, userNombre: u.nombre } })
    : await prisma.accesoTesoreria.create({ data: { userId: u.id, userNombre: u.nombre, nivel, creadoPorUserId: actor.id, creadoPorNombre: actor.nombre || null } });
  logTesoreria(actor, {
    action: antes ? "editar" : "otorgar", entityType: "accesoTesoreria", recordId: fila.id, recordInfo: `Acceso de ${u.nombre} a Tesorería`,
    before: antes ? { persona: u.nombre, nivel: antes.nivel } : null, after: { persona: u.nombre, nivel },
  }).catch(() => {});
  return fila;
}

async function exigirOtroFirmante(userIdQueSale) {
  const otros = await prisma.accesoTesoreria.count({ where: { nivel: "firma", userId: { not: userIdQueSale } } });
  if (!otros) throw badRequest("Tiene que quedar al menos una persona con acceso de firma.");
}

export async function quitarAcceso(actor, id) {
  if (!(await puedeAdministrarAccesos(actor))) throw forbidden("Solo quien firma en Tesorería administra los accesos.");
  const a = await prisma.accesoTesoreria.findUnique({ where: { id: Number(id) || 0 } });
  if (!a) throw notFound("Ese acceso no existe.");
  if (a.nivel === "firma") await exigirOtroFirmante(a.userId);
  await prisma.accesoTesoreria.delete({ where: { id: a.id } });
  logTesoreria(actor, { action: "quitar", entityType: "accesoTesoreria", recordId: a.id, recordInfo: `Acceso de ${a.userNombre} a Tesorería`, before: { persona: a.userNombre, nivel: a.nivel }, after: null }).catch(() => {});
  return { ok: true };
}
