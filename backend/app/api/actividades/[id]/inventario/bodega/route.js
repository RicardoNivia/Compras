import { NextResponse } from "next/server";
import { requirePermisoActividad, apiError } from "@/lib/apiGuard";
import { salidaParaActividad, devolverABodega } from "@/lib/inventarioBodega";

/**
 * @openapi
 * /api/actividades/{id}/inventario/bodega:
 *   post:
 *     tags: [Bienestar]
 *     summary: Saca artículos de la bodega para la actividad ({ articuloId, cantidad, costoUnitario? }) o devuelve lo que sobró ({ accion devolver, itemId, cantidad }). Nunca más de lo que hay (409). Editar la línea de la actividad.
 */
export async function POST(request, { params }) {
  const { user, denied } = await requirePermisoActividad(params.id, "editar");
  if (denied) return denied;
  try {
    const body = await request.json();
    const r = body?.accion === "devolver" ? await devolverABodega(params.id, body, user) : await salidaParaActividad(params.id, body, user);
    return NextResponse.json(r, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
