import { NextResponse } from "next/server";
import { requirePermission, apiError } from "@/lib/apiGuard";
import { marcarEnviada } from "@/lib/reportEdiciones";

/**
 * @openapi
 * /api/reports/ediciones/{edId}/enviado:
 *   post:
 *     tags: [Informes]
 *     summary: Marca una edición como enviada por el usuario (flujo Lo envío yo). Queda en la actividad del informe y en Auditoría (requiere permiso viewReportes).
 *     parameters:
 *       - { name: edId, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200:
 *         description: Edición actualizada.
 *         content:
 *           application/json:
 *             schema: { type: object }
 *       400:
 *         description: La edición no está pendiente de envío.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
export async function POST(request, { params }) {
  const { user, denied } = await requirePermission("viewReportes");
  if (denied) return denied;
  try {
    return NextResponse.json(await marcarEnviada(params.edId, user));
  } catch (err) {
    return apiError(err);
  }
}
