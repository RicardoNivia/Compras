import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-server";
import { getEffectivePermissions } from "@/lib/permissions";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  // Se entrega junto con el usuario para que el frontend (páginas server y
  // Sidebar) pueda reflejar la Matriz de permisos sin tener que consultar la
  // base de datos directamente — solo lee vía HTTP, igual que el resto.
  const permissions = await getEffectivePermissions(user.role);
  return NextResponse.json({ user: { ...user, permissions } });
}
