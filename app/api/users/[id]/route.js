import { NextResponse } from "next/server";
import { updateUser, deleteUser } from "@/lib/users";

// Protegido por middleware.js (solo rol "admin" llega hasta aquí).

export async function PUT(request, { params }) {
  try {
    const body = await request.json();
    const user = await updateUser(params.id, body);
    return NextResponse.json(user);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}

export async function DELETE(_request, { params }) {
  try {
    await deleteUser(params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}
