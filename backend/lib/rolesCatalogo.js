import { prisma } from "@/lib/prisma";
import { ROLE_LIST, ROLE_LABELS } from "@/lib/roles";

// Catálogo de roles en runtime: los 5 del sistema (lib/roles.js, con reglas propias en el código) más los
// personalizados creados en Usuarios › Roles (modelo RolPersonalizado, ver lib/rolesPersonalizados.js). Lo usan la
// Matriz de permisos, la validación de usuarios y /api/auth/me para mostrar el nombre del rol.

export async function rolesPersonalizados() {
  return prisma.rolPersonalizado.findMany({ orderBy: { nombre: "asc" } });
}

// [{ clave, nombre, descripcion, sistema }] — primero los del sistema, en su orden de siempre.
export async function todosLosRoles() {
  const custom = await rolesPersonalizados().catch(() => []);
  return [
    ...ROLE_LIST.map((clave) => ({ clave, nombre: ROLE_LABELS[clave], descripcion: null, sistema: true })),
    ...custom.map((r) => ({ id: r.id, clave: r.clave, nombre: r.nombre, descripcion: r.descripcion, sistema: false, createdAt: r.createdAt, creadoPorNombre: r.creadoPorNombre })),
  ];
}

export async function esRolValido(clave) {
  if (ROLE_LIST.includes(clave)) return true;
  if (!clave) return false;
  return !!(await prisma.rolPersonalizado.findUnique({ where: { clave: String(clave) }, select: { id: true } }));
}

export async function nombreDeRol(clave) {
  if (ROLE_LABELS[clave]) return ROLE_LABELS[clave];
  const r = await prisma.rolPersonalizado.findUnique({ where: { clave: String(clave || "") }, select: { nombre: true } }).catch(() => null);
  return r?.nombre || clave;
}
