import { NextResponse } from "next/server";
import { requirePermisoActividad, apiError } from "@/lib/apiGuard";
import { sugerirCompras, crearSolicitudesSugeridas } from "@/lib/agenteComprasActividad";

/**
 * @openapi
 * /api/actividades/{id}/sugerir-compras:
 *   post:
 *     tags: [Bienestar]
 *     summary: "Sin body: Nova propone la lista de compras de la actividad a partir de actividades parecidas (valores = promedio de las compras de referencia). Con { crear: true, items }: crea esas solicitudes de compra. Requiere editar la línea."
 *     responses:
 *       200: { description: "{ actividad, items, total, presupuesto, comprometido, parecidas, nota } o { creadas }" }
 */
export async function POST(request, { params }) {
  const { user, denied } = await requirePermisoActividad(params.id, "editar");
  if (denied) return denied;
  try {
    const body = await request.json().catch(() => ({}));
    if (body?.crear) return NextResponse.json({ creadas: await crearSolicitudesSugeridas(params.id, body.items, user) });
    return NextResponse.json(await sugerirCompras(params.id));
  } catch (err) {
    return apiError(err);
  }
}
