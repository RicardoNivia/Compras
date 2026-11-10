import { NextResponse } from "next/server";
import { requirePermisoActividad, apiError } from "@/lib/apiGuard";
import { crearSolicitud, solicitudesDeActividad } from "@/lib/solicitudesCompra";

/**
 * @openapi
 * /api/actividades/{id}/solicitudes:
 *   get:
 *     tags: [Bienestar]
 *     summary: Solicitudes de compra de la actividad, con su estado y el motivo si se rechazó. Requiere ver la línea de la actividad.
 *   post:
 *     tags: [Bienestar]
 *     summary: Solicita una compra para la actividad. Requiere editar la línea de la actividad.
 */
export async function GET(_request, { params }) {
  const { denied } = await requirePermisoActividad(params.id, "ver");
  if (denied) return denied;
  try {
    return NextResponse.json({ solicitudes: await solicitudesDeActividad(params.id) });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(request, { params }) {
  const { user, denied } = await requirePermisoActividad(params.id, "editar");
  if (denied) return denied;
  try {
    return NextResponse.json({ solicitud: await crearSolicitud(params.id, await request.json(), user) }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
