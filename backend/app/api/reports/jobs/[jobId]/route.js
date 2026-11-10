import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/apiGuard";
import { getSessionUser } from "@/lib/auth-server";
import { getJob } from "@/lib/reportJobs";

// Consulta genérica de estado para trabajos en segundo plano de Informes
// (preview y send-now, ver sus route.js) — ver lib/reportJobs.js.
/**
 * @openapi
 * /api/reports/jobs/{jobId}:
 *   get:
 *     tags: [Informes]
 *     summary: Consulta genérica de estado para trabajos en segundo plano de Informes (preview, send-now, cuerpo-ia, sugerir-bloques); requiere permiso "viewReportes".
 *     parameters:
 *       - { name: jobId, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Estado del trabajo.
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - type: object
 *                   properties: { status: { type: string, enum: [pending] } }
 *                 - type: object
 *                   properties: { status: { type: string, enum: [error] }, error: { type: string } }
 *                 - type: object
 *                   properties: { status: { type: string, enum: [done] }, result: { type: object, description: "Depende de qué ruta creó el trabajo." } }
 *       403:
 *         description: No autorizado.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: Trabajo no encontrado o expirado.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
export async function GET(request, { params }) {
  const job = getJob(params.jobId);
  // Quien tiene permiso de Informes consulta cualquier trabajo; el resto, solo los que creó (informes compartidos).
  const { denied } = await requirePermission("viewReportes");
  if (denied) {
    const user = await getSessionUser();
    if (!user || !job || job.ownerId !== user.id) return denied;
  }

  if (!job) return NextResponse.json({ error: "Trabajo no encontrado o expirado." }, { status: 404 });

  if (job.status === "pending") return NextResponse.json({ status: "pending" });
  if (job.status === "error") return NextResponse.json({ status: "error", error: job.error });
  return NextResponse.json({ status: "done", result: job.result });
}
