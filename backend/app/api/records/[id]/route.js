import { NextResponse } from "next/server";
import { updateRecord, patchRecord, deleteRecord } from "@/lib/records";
import { getSessionUser } from "@/lib/auth-server";
import { canEditRecord, canDeleteRecord, canToggleRadicado, getEditableFields } from "@/lib/roles";

export async function PUT(request, { params }) {
  const user = await getSessionUser();
  if (!user || !canEditRecord(user.role)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }
  try {
    const body = await request.json();
    const record = await updateRecord(params.id, body, user, { fields: getEditableFields(user.role) });
    return NextResponse.json(record);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}

// Actualización parcial (usada para el toggle de "radicado").
export async function PATCH(request, { params }) {
  const user = await getSessionUser();
  if (!user || !canToggleRadicado(user.role)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }
  try {
    const body = await request.json();
    const record = await patchRecord(params.id, body, user);
    return NextResponse.json(record);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}

export async function DELETE(_request, { params }) {
  const user = await getSessionUser();
  if (!user || !canDeleteRecord(user.role)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }
  try {
    await deleteRecord(params.id, user);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}
