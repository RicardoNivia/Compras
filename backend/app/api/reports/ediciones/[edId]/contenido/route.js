import { NextResponse } from "next/server";
import { requirePermission, apiError } from "@/lib/apiGuard";
import { getEdicionContenido } from "@/lib/reportEdiciones";

/**
 * @openapi
 * /api/reports/ediciones/{edId}/contenido:
 *   get:
 *     tags: [Informes]
 *     summary: Contenido guardado de una edición (por ejemplo una foto de un informe solo para consultar), tal como quedó, sin recalcular (requiere permiso viewReportes).
 *     parameters:
 *       - { name: edId, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200:
 *         description: Contenido.
 *         content:
 *           application/json:
 *             schema: { type: object }
 */
export async function GET(request, { params }) {
  const { denied } = await requirePermission("viewReportes");
  if (denied) return denied;
  try {
    return NextResponse.json(await getEdicionContenido(params.edId));
  } catch (err) {
    return apiError(err);
  }
}
