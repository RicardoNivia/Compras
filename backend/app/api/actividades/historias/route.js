import { NextResponse } from "next/server";
import { requireAlgunPermiso, apiError } from "@/lib/apiGuard";
import { historiasFundacion } from "@/lib/historiasFundacion";

/**
 * @openapi
 * /api/actividades/historias:
 *   get:
 *     tags: [Bienestar]
 *     summary: Historias de Fundación (Conectando Corazones) de un año (?anio) — jornadas realizadas con fotos, personas por área, comentarios a favor sin autor y el análisis de Nova. Requiere ver Fundación.
 *     responses:
 *       200: { description: "{ anio, totales, jornadas, proximas }" }
 */
export async function GET(request) {
  const { denied } = await requireAlgunPermiso(["viewFundacion", "viewDashboardFundacion"]);
  if (denied) return denied;
  try {
    return NextResponse.json(await historiasFundacion(new URL(request.url).searchParams.get("anio")));
  } catch (err) {
    return apiError(err);
  }
}
