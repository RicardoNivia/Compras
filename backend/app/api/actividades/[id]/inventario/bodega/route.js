import { NextResponse } from "next/server";
import { requirePermisoActividad, apiError } from "@/lib/apiGuard";
import { salidaParaActividad, devolverABodega, ajustarCantidadDeBodega } from "@/lib/inventarioBodega";

/**
 * @openapi
 * /api/actividades/{id}/inventario/bodega:
 *   post:
 *     tags: [Bienestar]
 *     summary: Saca artículos de la bodega para la actividad ({ articuloId, cantidad, costoUnitario? }) , devuelve lo que sobró ({ accion devolver, itemId, cantidad }) o cambia la cantidad de un ítem de la bodega ({ accion cantidad, itemId, cantidad }: la diferencia sale o vuelve a la bodega). Nunca más de lo que hay (409). Editar la línea de la actividad.
 */
export async function POST(request, { params }) {
  const { user, denied } = await requirePermisoActividad(params.id, "editar");
  if (denied) return denied;
  try {
    const body = await request.json();
    const r = body?.accion === "devolver" ? await devolverABodega(params.id, body, user)
      : body?.accion === "cantidad" ? await ajustarCantidadDeBodega(params.id, body, user)
      : await salidaParaActividad(params.id, body, user);
    return NextResponse.json(r, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
