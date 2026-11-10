import { NextResponse } from "next/server";
import { requirePermission, apiError } from "@/lib/apiGuard";
import { getEdicion } from "@/lib/reportEdiciones";

/**
 * @openapi
 * /api/reports/ediciones/{edId}:
 *   get:
 *     tags: [Informes]
 *     summary: Una edición de un informe con su asunto, mensaje y destinatarios ya resueltos, sin el PDF (requiere permiso viewReportes).
 *     parameters:
 *       - { name: edId, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200:
 *         description: Edición.
 *         content:
 *           application/json:
 *             schema: { type: object }
 *       404:
 *         description: Edición no encontrada.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
export async function GET(request, { params }) {
  const { denied } = await requirePermission("viewReportes");
  if (denied) return denied;
  try {
    return NextResponse.json(await getEdicion(params.edId));
  } catch (err) {
    return apiError(err);
  }
}
