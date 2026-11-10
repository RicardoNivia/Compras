import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-server";
import { apiError } from "@/lib/apiGuard";
import { listAccesos, quitarAcceso } from "@/lib/tesoreria/accesos";

/**
 * @openapi
 * /api/tesoreria/accesos/{id}:
 *   delete:
 *     tags: [Tesorería]
 *     summary: "Quita el acceso a Tesorería (siempre queda al menos una persona con firma)."
 */
export async function DELETE(_request, { params }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  try {
    await quitarAcceso(user, params.id);
    return NextResponse.json({ accesos: await listAccesos() });
  } catch (err) {
    return apiError(err);
  }
}
