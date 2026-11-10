import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-server";
import { apiError } from "@/lib/apiGuard";
import { getSolicitud } from "@/lib/solicitudesProveedorCorreo";

/**
 * @openapi
 * /api/correo/solicitudes/{id}:
 *   get:
 *     tags: [Mi correo]
 *     summary: "Una solicitud de proveedor del agente de correo (solo la dueña del buzón o un admin), con los faltantes recalculados."
 */
export async function GET(_request, { params }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  try {
    return NextResponse.json(await getSolicitud(user, params.id));
  } catch (err) {
    return apiError(err);
  }
}
