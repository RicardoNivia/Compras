import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { ROLE_LIST } from "@/lib/roles";
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

function validateShared(body) {
  if (!body.nombre?.trim() || !body.email?.trim() || !body.role) {
    throw badRequest("Nombre, correo y rol son obligatorios.");
  }
  if (!ROLE_LIST.includes(body.role)) {
    throw badRequest("Rol inválido.");
  }
}

export async function createUser(body, actor) {
  validateShared(body);
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
  validateShared(body);
  if (body.password && body.password.length < 6) {
    throw badRequest("La contraseña debe tener al menos 6 caracteres.");
  }
  const email = body.email.toLowerCase().trim();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && existing.id !== id) throw badRequest("Ya existe un usuario con ese correo.");

  const before = await prisma.user.findUnique({ where: { id } });

  const data = {
    nombre: body.nombre.trim(),
    email,
    role: body.role,
    activo: body.activo ?? true,
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
  const before = await prisma.user.findUnique({ where: { id } });
  await prisma.user.delete({ where: { id } });
  if (before) await logUserDelete(actor, toClientUser(before)).catch(() => {});
}
