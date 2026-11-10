import { NextResponse } from "next/server";
import { requirePermission, apiError } from "@/lib/apiGuard";
import { edicionesPorEnviar } from "@/lib/reportEdiciones";

/**
 * @openapi
 * /api/reports/por-enviar:
 *   get:
 *     tags: [Informes]
 *     summary: Ediciones que el usuario de la sesión tiene pendientes de enviar porque es responsable del informe (requiere permiso viewReportes).
 *     responses:
 *       200:
 *         description: Ediciones por enviar.
 *         content:
 *           application/json:
 *             schema: { type: object, properties: { ediciones: { type: array, items: { type: object } } } }
 */
export async function GET() {
  const { user, denied } = await requirePermission("viewReportes");
  if (denied) return denied;
  try {
    return NextResponse.json({ ediciones: await edicionesPorEnviar(user) });
  } catch (err) {
    return apiError(err);
  }
}
