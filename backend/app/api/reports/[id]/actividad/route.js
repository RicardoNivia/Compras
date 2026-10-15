import { NextResponse } from "next/server";
import { requirePermission, apiError } from "@/lib/apiGuard";
import { listAuditLogs } from "@/lib/audit";

/**
 * @openapi
 * /api/reports/{id}/actividad:
 *   get:
 *     tags: [Informes]
 *     summary: Actividad de un informe y de sus ediciones (creación, cambios, generación, descargas y envíos), tomada de Auditoría (requiere permiso viewReportes).
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Entradas de auditoría, de la más reciente a la más antigua.
 *         content:
 *           application/json:
 *             schema: { type: object, properties: { logs: { type: array, items: { type: object } } } }
 */
export async function GET(request, { params }) {
  const { denied } = await requirePermission("viewReportes");
  if (denied) return denied;
  try {
    const { logs } = await listAuditLogs({ recordId: params.id, pageSize: 40 });
    return NextResponse.json({ logs });
  } catch (err) {
    return apiError(err);
  }
}
