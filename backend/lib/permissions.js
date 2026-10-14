import { prisma } from "@/lib/prisma";
import { ROLES, ROLE_LIST, ROLE_LABELS } from "@/lib/roles";
import { logPermissionChange } from "@/lib/audit";

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

// Catálogo de funcionalidades administrables desde la Matriz de permisos
// (sección Usuarios, solo admin). "defaultRoles" es el comportamiento actual
// codificado en lib/roles.js — se usa como valor por defecto mientras no
// exista una excepción guardada en RolePermission para (role, feature).
// Si agregas una funcionalidad nueva aquí, también debes leerla desde el
// punto del código donde hoy se decide ese permiso (ver lib/roles.js y los
// route handlers que la usan) para que la matriz tenga efecto real.
export const FEATURES = [
  { key: "viewDashboard", label: "Ver Dashboard de compras", section: "Dashboard", defaultRoles: [ROLES.ADMIN, ROLES.REGISTRO, ROLES.LEGALIZAR, ROLES.RADICAR] },
  { key: "viewAlertas", label: "Ver Mi día y alertas", section: "Alertas", defaultRoles: [ROLES.ADMIN, ROLES.REGISTRO, ROLES.LEGALIZAR, ROLES.RADICAR, ROLES.PROVEEDORES] },
  { key: "viewAgenteIA", label: "Ver Nova", section: "Nova", defaultRoles: [ROLES.ADMIN, ROLES.REGISTRO, ROLES.LEGALIZAR, ROLES.RADICAR, ROLES.PROVEEDORES] },
  { key: "createRecord", label: "Crear registro de compra", section: "Registros", defaultRoles: [ROLES.ADMIN, ROLES.REGISTRO] },
  { key: "editRecord", label: "Editar registro de compra", section: "Registros", defaultRoles: [ROLES.ADMIN, ROLES.REGISTRO, ROLES.LEGALIZAR] },
  { key: "deleteRecord", label: "Eliminar registro de compra", section: "Registros", defaultRoles: [ROLES.ADMIN] },
  { key: "toggleRadicado", label: "Marcar radicado", section: "Registros", defaultRoles: [ROLES.ADMIN, ROLES.RADICAR] },
  { key: "viewMaestros", label: "Ver y configurar Maestros (incluye el ciclo de proveedores)", section: "Maestros", defaultRoles: [ROLES.ADMIN, ROLES.PROVEEDORES] },
  { key: "viewProveedores", label: "Ver Proveedores (maestro, ciclo e indicadores)", section: "Proveedores", defaultRoles: [ROLES.ADMIN, ROLES.REGISTRO, ROLES.PROVEEDORES] },
  { key: "editProveedores", label: "Editar proveedores (estados, checklist, excepciones)", section: "Proveedores", defaultRoles: [ROLES.ADMIN, ROLES.PROVEEDORES] },
  { key: "viewPresupuesto", label: "Ver y configurar Presupuesto", section: "Presupuesto", defaultRoles: [ROLES.ADMIN] },
  { key: "viewUsuarios", label: "Administrar Usuarios", section: "Usuarios", defaultRoles: [ROLES.ADMIN] },
  { key: "viewAuditoria", label: "Ver Auditoría", section: "Auditoría", defaultRoles: [ROLES.ADMIN] },
  { key: "viewReportes", label: "Ver y configurar Informes automáticos", section: "Informes", defaultRoles: [ROLES.ADMIN] },
];

const FEATURE_MAP = new Map(FEATURES.map((f) => [f.key, f]));

function defaultAllowed(featureKey, role) {
  const f = FEATURE_MAP.get(featureKey);
  return f ? f.defaultRoles.includes(role) : false;
}

// Único punto de verdad en runtime: ¿puede este rol usar esta funcionalidad?
// Si no hay excepción guardada, cae al valor por defecto — así un problema
// de datos (fila faltante, tabla vacía, incluso un error de conexión) nunca
// dejar a nadie sin el acceso que ya tenía antes de existir esta matriz.
// admin es la excepción: siempre tiene todo, sin importar lo que haya
// guardado en RolePermission — nunca se puede quitar desde la matriz (así
// no hay forma de bloquear por accidente el acceso administrativo).
export async function isRoleAllowed(role, featureKey) {
  if (role === ROLES.ADMIN) return true;
  try {
    const row = await prisma.rolePermission.findUnique({ where: { role_feature: { role, feature: featureKey } } });
    if (row) return row.allowed;
  } catch {
    // fallo de lectura: se usa el valor por defecto, nunca se bloquea por esto
  }
  return defaultAllowed(featureKey, role);
}

// Matriz completa para la UI de administración: una fila por funcionalidad,
// con el valor efectivo (excepción guardada, o por defecto) para cada rol.
export async function getFullMatrix() {
  const overrides = await prisma.rolePermission.findMany();
  const overrideMap = new Map(overrides.map((o) => [`${o.role}|${o.feature}`, o.allowed]));
  return FEATURES.map((f) => ({
    key: f.key,
    label: f.label,
    section: f.section,
    roles: Object.fromEntries(ROLE_LIST.map((role) => [
      role,
      role === ROLES.ADMIN ? true : (overrideMap.has(`${role}|${f.key}`) ? overrideMap.get(`${role}|${f.key}`) : f.defaultRoles.includes(role)),
    ])),
  }));
}

// El mapa efectivo de un solo rol (usado para exponerlo al usuario logueado
// vía /api/auth/me, así el frontend puede reflejar la matriz sin tocar la BD).
export async function getEffectivePermissions(role) {
  if (role === ROLES.ADMIN) return Object.fromEntries(FEATURES.map((f) => [f.key, true]));
  const overrides = await prisma.rolePermission.findMany({ where: { role } });
  const overrideMap = new Map(overrides.map((o) => [o.feature, o.allowed]));
  return Object.fromEntries(FEATURES.map((f) => [f.key, overrideMap.has(f.key) ? overrideMap.get(f.key) : f.defaultRoles.includes(role)]));
}

export async function setPermission({ role, feature, allowed }, actor) {
  if (!ROLE_LIST.includes(role)) throw badRequest("Rol inválido.");
  if (role === ROLES.ADMIN) throw badRequest("El rol Administrador siempre tiene todos los permisos y no se puede modificar.");
  const featureDef = FEATURE_MAP.get(feature);
  if (!featureDef) throw badRequest("Funcionalidad inválida.");
  if (typeof allowed !== "boolean") throw badRequest("El valor del permiso debe ser verdadero o falso.");

  const existing = await prisma.rolePermission.findUnique({ where: { role_feature: { role, feature } } });
  const before = existing ? existing.allowed : featureDef.defaultRoles.includes(role);

  const row = await prisma.rolePermission.upsert({
    where: { role_feature: { role, feature } },
    update: { allowed },
    create: { role, feature, allowed },
  });

  await logPermissionChange(actor, role, ROLE_LABELS[role] || role, featureDef.label, before, allowed).catch(() => {});
  return row;
}
