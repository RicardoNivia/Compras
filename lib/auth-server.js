import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

// Lee la cookie de sesión, la valida y devuelve el usuario actual (o null).
// Vuelve a consultar la base para reflejar cambios de rol/desactivación al vuelo.
export async function getSessionUser() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifySessionToken(token);
  if (!payload?.sub) return null;

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || !user.activo) return null;

  return { id: user.id, nombre: user.nombre, email: user.email, role: user.role };
}
