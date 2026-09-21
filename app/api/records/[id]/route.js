import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { toClientRecord, fromClientPayload } from "../../../../lib/records";

export const dynamic = "force-dynamic";

// PUT /api/records/:id — actualiza un registro existente (incluye
// ediciones desde el modal y el toggle de "radicado")
export async function PUT(request, { params }) {
  try {
    const body = await request.json();
    const data = fromClientPayload(body);
    const updated = await prisma.purchaseRecord.update({
      where: { id: params.id },
      data,
    });
    return NextResponse.json(toClientRecord(updated));
  } catch (err) {
    console.error("PUT /api/records/" + params.id, err);
    if (err.code === "P2025") {
      return NextResponse.json({ error: "Registro no encontrado." }, { status: 404 });
    }
    return NextResponse.json(
      { error: err.message || "No se pudo actualizar el registro." },
      { status: 400 }
    );
  }
}

// DELETE /api/records/:id
export async function DELETE(request, { params }) {
  try {
    await prisma.purchaseRecord.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/records/" + params.id, err);
    if (err.code === "P2025") {
      return NextResponse.json({ error: "Registro no encontrado." }, { status: 404 });
    }
    return NextResponse.json(
      { error: "No se pudo eliminar el registro." },
      { status: 500 }
    );
  }
}
