import { NextResponse } from "next/server";
import { updateRecord, patchRecord, deleteRecord } from "@/lib/records";

export async function PUT(request, { params }) {
  try {
    const body = await request.json();
    const record = await updateRecord(params.id, body);
    return NextResponse.json(record);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}

// Actualización parcial (usada para el toggle de "radicado").
export async function PATCH(request, { params }) {
  try {
    const body = await request.json();
    const record = await patchRecord(params.id, body);
    return NextResponse.json(record);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}

export async function DELETE(_request, { params }) {
  try {
    await deleteRecord(params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}
