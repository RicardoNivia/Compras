import { NextResponse } from "next/server";
import { listUsers, createUser } from "@/lib/users";
import { getSessionUser } from "@/lib/auth-server";
import { isRoleAllowed } from "@/lib/permissions";

// Gestión de usuarios: restringida por la funcionalidad "viewUsuarios" de la
// Matriz de permisos (por defecto, solo admin) — antes gateado a nivel de
// middleware.js con un rol fijo, ahora aquí para poder consultar la BD.

export async function GET() {
  const user = await getSessionUser();
  if (!user || !(await isRoleAllowed(user.role, "viewUsuarios"))) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }
  const users = await listUsers();
  return NextResponse.json({ users });
}

export async function POST(request) {
  const actor = await getSessionUser();
  if (!actor || !(await isRoleAllowed(actor.role, "viewUsuarios"))) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }
  try {
    const body = await request.json();
    const user = await createUser(body, actor);
    return NextResponse.json(user, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}
