import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { ROLES } from "@/lib/roles";
import { esRolValido } from "@/lib/rolesCatalogo";
import { logUserCreate, logUserUpdate, logUserDelete } from "@/lib/audit";

export function toClientUser(u) {
  return {
    id: u.id,
    nombre: u.nombre,
    email: u.email,
    role: u.role,
    activo: u.activo,
    createdAt: u.createdAt,
  };
}

export async function listUsers() {
  const users = await prisma.user.findMany({ orderBy: { nombre: "asc" } });
  return users.map(toClientUser);
}

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function forbidden(message) {
  const err = new Error(message);
  err.status = 403;
  return err;
}

// El rol puede ser uno del sistema o uno personalizado (Usuarios › Roles).
async function validateShared(body) {
  if (!body.nombre?.trim() || !body.email?.trim() || !body.role) {
    throw badRequest("Nombre, correo y rol son obligatorios.");
  }
  if (!(await esRolValido(body.role))) {
    throw badRequest("Rol inválido.");
  }
}

// Solo un admin puede otorgar el rol admin — evita que un actor con acceso a
// administración de usuarios (concedido vía la Matriz de permisos a un rol
// inferior) se autopromueva o promueva a otro a administrador total.
function assertCanAssignRole(actor, role) {
  if (role === ROLES.ADMIN && actor.role !== ROLES.ADMIN) {
    throw forbidden("Solo un administrador puede asignar el rol Administrador.");
  }
}

// Evita quedarse sin ningún admin activo (lo que requeriría acceso directo a
// la base de datos para recuperar el sistema).
async function assertKeepsAnActiveAdmin(existingUser, nextRole, nextActivo) {
  const wasActiveAdmin = existingUser.role === ROLES.ADMIN && existingUser.activo;
  const staysActiveAdmin = nextRole === ROLES.ADMIN && nextActivo;
  if (!wasActiveAdmin || staysActiveAdmin) return;
  const otherActiveAdmins = await prisma.user.count({
    where: { role: ROLES.ADMIN, activo: true, id: { not: existingUser.id } },
  });
  if (otherActiveAdmins === 0) {
    throw badRequest("No puedes dejar el sistema sin ningún administrador activo.");
  }
}

export async function createUser(body, actor) {
  await validateShared(body);
  assertCanAssignRole(actor, body.role);
  if (!body.password || body.password.length < 6) {
    throw badRequest("La contraseña debe tener al menos 6 caracteres.");
  }
  const email = body.email.toLowerCase().trim();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw badRequest("Ya existe un usuario con ese correo.");

  const user = await prisma.user.create({
    data: {
      nombre: body.nombre.trim(),
      email,
      password: await bcrypt.hash(body.password, 10),
      role: body.role,
      activo: body.activo ?? true,
    },
  });
  const client = toClientUser(user);
  await logUserCreate(actor, client).catch(() => {});
  return client;
}

export async function updateUser(id, body, actor) {
  await validateShared(body);
  assertCanAssignRole(actor, body.role);
  if (body.password && body.password.length < 6) {
    throw badRequest("La contraseña debe tener al menos 6 caracteres.");
  }
  const email = body.email.toLowerCase().trim();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && existing.id !== id) throw badRequest("Ya existe un usuario con ese correo.");

  const before = await prisma.user.findUnique({ where: { id } });
  if (!before) throw badRequest("Usuario no encontrado.");

  const nextActivo = body.activo ?? true;
  if (actor.id === id && !nextActivo) {
    throw badRequest("No puedes desactivar tu propia cuenta.");
  }
  await assertKeepsAnActiveAdmin(before, body.role, nextActivo);

  const data = {
    nombre: body.nombre.trim(),
    email,
    role: body.role,
    activo: nextActivo,
  };
  if (body.password) {
    data.password = await bcrypt.hash(body.password, 10);
  }
  const user = await prisma.user.update({ where: { id }, data });
  const after = toClientUser(user);
  await logUserUpdate(actor, before ? toClientUser(before) : null, after).catch(() => {});
  return after;
}

export async function changeOwnPassword(userId, currentPassword, newPassword) {
  if (!currentPassword || !newPassword) {
    throw badRequest("La contraseña actual y la nueva son obligatorias.");
  }
  if (newPassword.length < 6) {
    throw badRequest("La nueva contraseña debe tener al menos 6 caracteres.");
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw badRequest("Usuario no encontrado.");

  const valid = await bcrypt.compare(currentPassword, user.password);
  if (!valid) {
    const err = new Error("La contraseña actual no es correcta.");
    err.status = 401;
    throw err;
  }

  await prisma.user.update({
    where: { id: userId },
    data: { password: await bcrypt.hash(newPassword, 10) },
  });
}

export async function deleteUser(id, actor) {
  if (actor.id === id) {
    throw badRequest("No puedes eliminar tu propia cuenta.");
  }
  const before = await prisma.user.findUnique({ where: { id } });
  if (before && before.role === ROLES.ADMIN && before.activo) {
    const otherActiveAdmins = await prisma.user.count({
      where: { role: ROLES.ADMIN, activo: true, id: { not: id } },
    });
    if (otherActiveAdmins === 0) {
      throw badRequest("No puedes eliminar al único administrador activo.");
    }
  }
  await prisma.user.delete({ where: { id } });
  if (before) await logUserDelete(actor, toClientUser(before)).catch(() => {});
}
