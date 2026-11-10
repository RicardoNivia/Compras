import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/apiGuard";
import { PLANTILLAS } from "@/lib/reportNova";

/**
 * @openapi
 * /api/reports/plantillas:
 *   get:
 *     tags: [Informes]
 *     summary: Plantillas de un clic del Estudio de informes, con sus bloques y período (requiere permiso viewReportes).
 *     responses:
 *       200:
 *         description: Plantillas.
 *         content:
 *           application/json:
 *             schema: { type: object, properties: { plantillas: { type: array, items: { type: object } } } }
 */
export async function GET() {
  const { denied } = await requirePermission("viewReportes");
  if (denied) return denied;
  return NextResponse.json({ plantillas: PLANTILLAS });
}
