import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/apiGuard";
import { getJob } from "@/lib/reportJobs";

// Consulta genérica de estado para el trabajo en segundo plano del chat del
// Agente IA (ver ../route.js) — mismo patrón de polling que ya usan los
// Informes automáticos (ver lib/reportJobs.js y app/api/reports/jobs/[jobId]/route.js):
// el POST inicial solo crea el trabajo y responde al toque; esta ruta se
// consulta con GETs cortos y rápidos hasta que termina.
/**
 * @openapi
 * /api/agent/chat/jobs/{jobId}:
 *   get:
 *     tags: [Agente IA]
 *     summary: Consulta genérica de estado para el trabajo en segundo plano del chat del Agente IA (requiere permiso "viewAgenteIA").
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
 *                   properties:
 *                     status: { type: string, enum: [done] }
 *                     result: { type: object, properties: { text: { type: string } } }
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
  const { denied } = await requirePermission("viewAgenteIA");
  if (denied) return denied;
  const job = getJob(params.jobId);
  if (!job) return NextResponse.json({ error: "Trabajo no encontrado o expirado." }, { status: 404 });

  if (job.status === "pending") return NextResponse.json({ status: "pending" });
  if (job.status === "error") return NextResponse.json({ status: "error", error: job.error });
  return NextResponse.json({ status: "done", result: job.result });
}
