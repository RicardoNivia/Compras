import { NextResponse } from "next/server";
import { requirePermission, apiError } from "@/lib/apiGuard";
import { descartarSolicitud } from "@/lib/solicitudesProveedorCorreo";

/**
 * @openapi
 * /api/correo/solicitudes/{id}/descartar:
 *   post:
 *     tags: [Mi correo]
 *     summary: "Descarta la solicitud ({ motivo } opcional). Permiso editProveedores."
 */
export async function POST(request, { params }) {
  const { user, denied } = await requirePermission("editProveedores");
  if (denied) return denied;
  try {
    const body = await request.json().catch(() => ({}));
    return NextResponse.json(await descartarSolicitud(user, params.id, body.motivo));
  } catch (err) {
    return apiError(err);
  }
}
