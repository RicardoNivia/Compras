import { NextResponse } from "next/server";
import { listMaestros, createMaestro } from "@/lib/maestros";
import { getSessionUser } from "@/lib/auth-server";
import { canViewMaestros } from "@/lib/roles";

// Sin chequeo de rol más allá de estar autenticado (lo garantiza el
// middleware): cualquier rol que pueda editar registros necesita leer estas
// listas para poblar los <select> del formulario.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const tipo = searchParams.get("tipo") || undefined;
  const onlyActive = searchParams.get("onlyActive") === "1";
  try {
    const maestros = await listMaestros({ tipo, onlyActive });
    return NextResponse.json({ maestros });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}

export async function POST(request) {
  const user = await getSessionUser();
  if (!user || !canViewMaestros(user.role)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }
  try {
    const body = await request.json();
    const maestro = await createMaestro(body);
    return NextResponse.json(maestro, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}
