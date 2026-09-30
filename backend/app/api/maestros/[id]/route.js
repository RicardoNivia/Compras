import { NextResponse } from "next/server";
import { updateMaestro, deleteMaestro } from "@/lib/maestros";
import { getSessionUser } from "@/lib/auth-server";
import { isRoleAllowed } from "@/lib/permissions";

export async function PATCH(request, { params }) {
  const user = await getSessionUser();
  if (!user || !(await isRoleAllowed(user.role, "viewMaestros"))) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }
  try {
    const body = await request.json();
    const maestro = await updateMaestro(params.id, body, user);
    return NextResponse.json(maestro);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}

export async function DELETE(_request, { params }) {
  const user = await getSessionUser();
  if (!user || !(await isRoleAllowed(user.role, "viewMaestros"))) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }
  try {
    await deleteMaestro(params.id, user);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}
