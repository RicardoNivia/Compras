import { NextResponse } from "next/server";
import { listPresupuestos, upsertPresupuesto } from "@/lib/presupuestos";
import { getSessionUser } from "@/lib/auth-server";
import { isRoleAllowed } from "@/lib/permissions";

// El tema de presupuesto queda restringido por la funcionalidad
// "viewPresupuesto" de la Matriz de permisos (por defecto, solo admin):
// también la lectura, no solo crear/editar/eliminar.
export async function GET(request) {
  const user = await getSessionUser();
  if (!user || !(await isRoleAllowed(user.role, "viewPresupuesto"))) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }
  const { searchParams } = new URL(request.url);
  const anio = searchParams.get("anio") || undefined;
  try {
    const result = await listPresupuestos({ anio });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}

export async function POST(request) {
  const user = await getSessionUser();
  if (!user || !(await isRoleAllowed(user.role, "viewPresupuesto"))) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }
  try {
    const body = await request.json();
    const presupuesto = await upsertPresupuesto(body, user);
    return NextResponse.json(presupuesto, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}
