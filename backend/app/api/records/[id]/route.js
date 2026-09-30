import { NextResponse } from "next/server";
import { updateRecord, patchRecord, deleteRecord } from "@/lib/records";
import { getSessionUser } from "@/lib/auth-server";
import { getEditableFields, getPatchableFields } from "@/lib/roles";
import { isRoleAllowed } from "@/lib/permissions";

export async function PUT(request, { params }) {
  const user = await getSessionUser();
  if (!user || !(await isRoleAllowed(user.role, "editRecord"))) {
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
  if (!user || !(await isRoleAllowed(user.role, "toggleRadicado"))) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }
  try {
    const body = await request.json();
    const record = await patchRecord(params.id, body, user, { fields: getPatchableFields(user.role) });
    return NextResponse.json(record);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}

export async function DELETE(_request, { params }) {
  const user = await getSessionUser();
  if (!user || !(await isRoleAllowed(user.role, "deleteRecord"))) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }
  try {
    await deleteRecord(params.id, user);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}
