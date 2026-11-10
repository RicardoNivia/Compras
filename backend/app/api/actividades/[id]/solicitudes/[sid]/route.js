import { NextResponse } from "next/server";
import { requirePermisoActividad, apiError } from "@/lib/apiGuard";
import { cancelarSolicitud } from "@/lib/solicitudesCompra";

/**
 * @openapi
 * /api/actividades/{id}/solicitudes/{sid}:
 *   delete:
 *     tags: [Bienestar]
 *     summary: Cancela una solicitud que aún nadie ha atendido. Requiere editar la línea de la actividad.
 */
export async function DELETE(_request, { params }) {
  const { user, denied } = await requirePermisoActividad(params.id, "editar");
  if (denied) return denied;
  try {
    await cancelarSolicitud(params.id, params.sid, user);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
