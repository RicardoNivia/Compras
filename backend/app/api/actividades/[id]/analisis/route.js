import { NextResponse } from "next/server";
import { requirePermisoActividad, apiError } from "@/lib/apiGuard";
import { generarAnalisisActividad } from "@/lib/analisisActividad";

/**
 * @openapi
 * /api/actividades/{id}/analisis:
 *   post:
 *     tags: [Bienestar]
 *     summary: Genera o regenera el análisis de Nova de una actividad ejecutada o cerrada, con su puntaje de 1 a 5. Body { origen } (cierre|manual). Requiere editBienestar.
 *     responses:
 *       200: { description: "{ analisis }" }
 */
export async function POST(request, { params }) {
  const { user, denied } = await requirePermisoActividad(params.id, "editar");
  if (denied) return denied;
  try {
    const body = await request.json().catch(() => ({}));
    return NextResponse.json({ analisis: await generarAnalisisActividad(params.id, { actor: user, origen: body.origen === "cierre" ? "cierre" : "manual" }) });
  } catch (err) {
    return apiError(err);
  }
}
