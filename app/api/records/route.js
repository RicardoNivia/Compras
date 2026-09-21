import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { toClientRecord, fromClientPayload } from "../../../lib/records";

export const dynamic = "force-dynamic";

// GET /api/records — lista todos los registros de compras (SQLite)
export async function GET() {
  try {
    const records = await prisma.purchaseRecord.findMany({
      orderBy: [{ fechaSolicitud: "asc" }, { createdAt: "asc" }],
    });
    return NextResponse.json(records.map(toClientRecord));
  } catch (err) {
    console.error("GET /api/records", err);
    return NextResponse.json(
      { error: "No se pudieron leer los registros de la base de datos." },
      { status: 500 }
    );
  }
}

// POST /api/records — crea un registro nuevo
export async function POST(request) {
  try {
    const body = await request.json();
    const data = fromClientPayload(body);
    const created = await prisma.purchaseRecord.create({ data });
    return NextResponse.json(toClientRecord(created), { status: 201 });
  } catch (err) {
    console.error("POST /api/records", err);
    return NextResponse.json(
      { error: err.message || "No se pudo crear el registro." },
      { status: 400 }
    );
  }
}
