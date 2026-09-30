import { NextResponse } from "next/server";
import { updateUser, deleteUser } from "@/lib/users";
import { getSessionUser } from "@/lib/auth-server";
import { isRoleAllowed } from "@/lib/permissions";

// Restringido por la funcionalidad "viewUsuarios" de la Matriz de permisos
// (por defecto, solo admin) — ver app/api/users/route.js.

export async function PUT(request, { params }) {
  const actor = await getSessionUser();
  if (!actor || !(await isRoleAllowed(actor.role, "viewUsuarios"))) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }
  try {
    const body = await request.json();
    const user = await updateUser(params.id, body, actor);
    return NextResponse.json(user);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}

export async function DELETE(_request, { params }) {
  const actor = await getSessionUser();
  if (!actor || !(await isRoleAllowed(actor.role, "viewUsuarios"))) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }
  try {
    await deleteUser(params.id, actor);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}
