import { prisma } from "@/lib/prisma";
import { ROLES, ROLE_LIST, ROLE_LABELS } from "@/lib/roles";
import { FEATURES, getFullMatrix, setPermission } from "@/lib/permissions";
import { todosLosRoles } from "@/lib/rolesCatalogo";
import { logRolCreate, logRolUpdate, logRolDelete } from "@/lib/audit";

// Usuarios › Roles: crear roles nuevos y asignarles funcionalidades. Las funcionalidades de cualquier rol (del
// sistema o personalizado, menos Administrador) son la misma Matriz de permisos: cada cambio pasa por
// setPermission y queda auditado como "permiso". Nombre y descripción solo se editan en los personalizados.

const FEATURE_KEYS = new Set(FEATURES.map((f) => f.key));

function badRequest(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

const sinTildes = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "");

function claveDesde(nombre) {
  return sinTildes(nombre).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "rol";
}

async function usuariosPorRol() {
  const grupos = await prisma.user.groupBy({ by: ["role"], _count: { _all: true } });
  return new Map(grupos.map((g) => [g.role, g._count._all]));
}

// Cada rol con sus funcionalidades efectivas (las que tiene hoy, por defecto o por excepción) y cuántos usuarios lo tienen.
export async function listRoles() {
  const [roles, matrix, usuarios] = await Promise.all([todosLosRoles(), getFullMatrix(), usuariosPorRol()]);
  return roles.map((r) => ({
    ...r,
    usuarios: usuarios.get(r.clave) || 0,
    funcionalidades: matrix.filter((row) => row.roles[r.clave]).map((row) => row.key),
  }));
}

function leerNombre(v) {
  const nombre = String(v ?? "").trim();
  if (!nombre) throw badRequest("Ponle un nombre al rol.");
  if (nombre.length > 60) throw badRequest("El nombre del rol no puede pasar de 60 caracteres.");
  return nombre;
}

async function exigirNombreLibre(nombre, claveActual = null) {
  const n = sinTildes(nombre).toLowerCase();
  const roles = await todosLosRoles();
  if (roles.some((r) => r.clave !== claveActual && sinTildes(r.nombre).toLowerCase() === n)) throw badRequest(`Ya existe un rol llamado "${nombre}".`);
}

function leerFuncionalidades(lista) {
  if (lista === undefined) return undefined;
  if (!Array.isArray(lista)) throw badRequest("Las funcionalidades deben ser una lista.");
  const invalidas = lista.filter((k) => !FEATURE_KEYS.has(k));
  if (invalidas.length) throw badRequest(`Funcionalidad inválida: ${invalidas.join(", ")}.`);
  return new Set(lista);
}

// Aplica la lista deseada sobre la Matriz: solo escribe (y audita) las que cambian.
async function aplicarFuncionalidades(clave, deseadas, actor) {
  const matrix = await getFullMatrix();
  let cambios = 0;
  for (const row of matrix) {
    const quiere = deseadas.has(row.key);
    if (!!row.roles[clave] !== quiere) {
      await setPermission({ role: clave, feature: row.key, allowed: quiere }, actor);
      cambios++;
    }
  }
  return cambios;
}

const etiquetas = (keys) => FEATURES.filter((f) => keys.has(f.key)).map((f) => f.label).join(", ") || "Ninguna";

export async function createRol(body, actor) {
  const nombre = leerNombre(body?.nombre);
  await exigirNombreLibre(nombre);
  const funcionalidades = leerFuncionalidades(body?.funcionalidades) || new Set();
  const base = claveDesde(nombre);
  let clave = base;
  for (let i = 2; ROLE_LIST.includes(clave) || (await prisma.rolPersonalizado.findUnique({ where: { clave }, select: { id: true } })); i++) clave = `${base}_${i}`;

  const row = await prisma.rolPersonalizado.create({
    data: { clave, nombre, descripcion: String(body?.descripcion ?? "").trim().slice(0, 300) || null, creadoPorUserId: actor?.id || null, creadoPorNombre: actor?.nombre || null },
  });
  // Un rol nuevo no tiene permisos por defecto: se crean las filas de las funcionalidades elegidas.
  if (funcionalidades.size) {
    await prisma.rolePermission.createMany({ data: [...funcionalidades].map((feature) => ({ role: clave, feature, allowed: true })), skipDuplicates: true });
  }
  const cliente = { clave, nombre: row.nombre, descripcion: row.descripcion, sistema: false, usuarios: 0, funcionalidades: [...funcionalidades], creadoPorNombre: row.creadoPorNombre, createdAt: row.createdAt };
  logRolCreate(actor, { ...cliente, funcionalidadesTexto: etiquetas(funcionalidades) }).catch(() => {});
  return cliente;
}

export async function updateRol(clave, body, actor) {
  if (clave === ROLES.ADMIN) throw badRequest("El rol Administrador siempre tiene todos los permisos y no se puede modificar.");
  const sistema = ROLE_LIST.includes(clave);
  const custom = sistema ? null : await prisma.rolPersonalizado.findUnique({ where: { clave } });
  if (!sistema && !custom) throw badRequest("Rol no encontrado.", 404);

  const before = (await listRoles()).find((r) => r.clave === clave);
  const data = {};
  if (!sistema) {
    if (body?.nombre !== undefined) {
      data.nombre = leerNombre(body.nombre);
      await exigirNombreLibre(data.nombre, clave);
    }
    if (body?.descripcion !== undefined) data.descripcion = String(body.descripcion ?? "").trim().slice(0, 300) || null;
    if (Object.keys(data).length) await prisma.rolPersonalizado.update({ where: { clave }, data });
  } else if (body?.nombre !== undefined && body.nombre !== ROLE_LABELS[clave]) {
    throw badRequest("Los roles del sistema no se pueden renombrar.");
  }
  const funcionalidades = leerFuncionalidades(body?.funcionalidades);
  if (funcionalidades) await aplicarFuncionalidades(clave, funcionalidades, actor);

  const after = (await listRoles()).find((r) => r.clave === clave);
  if (!sistema) logRolUpdate(actor, before, after).catch(() => {});
  return after;
}

export async function deleteRol(clave, actor) {
  if (ROLE_LIST.includes(clave)) throw badRequest("Los roles del sistema no se pueden eliminar.");
  const row = await prisma.rolPersonalizado.findUnique({ where: { clave } });
  if (!row) throw badRequest("Rol no encontrado.", 404);
  const usuarios = await prisma.user.count({ where: { role: clave } });
  if (usuarios) throw badRequest(`${usuarios} usuario(s) tienen este rol. Asígnales otro antes de eliminarlo.`, 409);
  const before = (await listRoles()).find((r) => r.clave === clave);
  await prisma.$transaction([
    prisma.rolePermission.deleteMany({ where: { role: clave } }),
    prisma.rolPersonalizado.delete({ where: { clave } }),
  ]);
  logRolDelete(actor, { ...before, funcionalidadesTexto: etiquetas(new Set(before?.funcionalidades || [])) }).catch(() => {});
}
