import { NextResponse } from "next/server";
import { deletePresupuesto } from "@/lib/presupuestos";
import { getSessionUser } from "@/lib/auth-server";
import { canViewPresupuesto } from "@/lib/roles";

export async function DELETE(_request, { params }) {
  const user = await getSessionUser();
  if (!user || !canViewPresupuesto(user.role)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }
  try {
    await deletePresupuesto(params.id, user);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}
