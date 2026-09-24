import { NextResponse } from "next/server";
import { updateUser, deleteUser } from "@/lib/users";
import { getSessionUser } from "@/lib/auth-server";

// Protegido por middleware.js (solo rol "admin" llega hasta aquí).

export async function PUT(request, { params }) {
  try {
    const actor = await getSessionUser();
    const body = await request.json();
    const user = await updateUser(params.id, body, actor);
    return NextResponse.json(user);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}

export async function DELETE(_request, { params }) {
  try {
    const actor = await getSessionUser();
    await deleteUser(params.id, actor);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}
