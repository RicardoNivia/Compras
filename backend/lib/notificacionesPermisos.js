import { prisma } from "@/lib/prisma";
import { isRoleAllowed } from "@/lib/permissions";
import { canViewRegistros, ROLES } from "@/lib/roles";
import { FUENTES } from "@/lib/notificacionesCatalogo";

// Único punto de decisión de "¿esta persona puede ver los datos de esta fuente?" para las notificaciones.
// Se evalúa al crear, al editar, al elegir destinatarios y en CADA ejecución (ver lib/notificacionesMotor.js):
// si alguien pierde el acceso, deja de recibir; si lo pierde el propietario, la notificación se pausa sola.
export async function puedeVerFuente(user, fuente) {
  if (!user || user.activo === false) return false;
  switch (fuente) {
    case "compras":
      return canViewRegistros(user.role);
    case "mi_dia":
      return isRoleAllowed(user.role, "viewAlertas");
    case "proveedores":
      return isRoleAllowed(user.role, "viewProveedores");
    case "presupuesto":
      return isRoleAllowed(user.role, "viewPresupuesto");
    default:
      return false;
  }
}

export async function puedeUsarNotificaciones(user) {
  if (!user || user.activo === false) return false;
  return isRoleAllowed(user.role, "viewNotificaciones");
}

// Propietario o admin.
export function puedeGestionar(user, notif) {
  return !!user && (user.role === ROLES.ADMIN || notif.propietarioUserId === user.id);
}

export async function fuentesPermitidas(user) {
  const out = [];
  for (const f of Object.keys(FUENTES)) if (await puedeVerFuente(user, f)) out.push(f);
  return out;
}

// Usuarios activos que pueden recibir una notificación de esta fuente (también deben poder usar el módulo).
export async function destinatariosElegibles(fuente) {
  const users = await prisma.user.findMany({ where: { activo: true }, select: { id: true, nombre: true, email: true, role: true, activo: true }, orderBy: { nombre: "asc" } });
  const out = [];
  for (const u of users) {
    if ((await puedeVerFuente(u, fuente)) && (await puedeUsarNotificaciones(u))) out.push(u);
  }
  return out;
}

export function mensajeSinPermiso(fuente) {
  const f = FUENTES[fuente];
  return `Por seguridad no puedes crear esta notificación: usa datos de ${f?.label || fuente}, que tu rol no tiene habilitados.`;
}
