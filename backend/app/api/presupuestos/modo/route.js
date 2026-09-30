import { NextResponse } from "next/server";
import { setModoAnio } from "@/lib/presupuestos";
import { getSessionUser } from "@/lib/auth-server";
import { isRoleAllowed } from "@/lib/permissions";

// Define o cambia el modo (por área / por categoría) general de un año.
// Si ya hay presupuestos configurados en otro modo, requiere body.confirm=true
// (de lo contrario responde 409 con el detalle, para que el cliente muestre
// la advertencia antes de reintentar con la confirmación).
export async function POST(request) {
  const user = await getSessionUser();
  if (!user || !(await isRoleAllowed(user.role, "viewPresupuesto"))) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }
  try {
    const body = await request.json();
    const result = await setModoAnio(body, user);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err.message, requiresConfirm: err.requiresConfirm || false, afectados: err.afectados },
      { status: err.status || 500 }
    );
  }
}
