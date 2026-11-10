import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/apiGuard";
import { generateBloquesSugeridos } from "@/lib/reportContent";
import { createJob } from "@/lib/reportJobs";

// Botón "Armar informe automáticamente con IA" (sin prompt, sin bloques
// previos): analiza los datos reales de compras y propone una estructura de
// bloques (kpi/grafico/tabla/texto) — la IA solo decide QUÉ mostrar, nunca
// calcula las cifras (esas se calculan después, de forma determinística, al
// renderizar cada bloque). Mismo patrón de trabajo en segundo plano que
// preview/route.js.
/**
 * @openapi
 * /api/reports/sugerir-bloques:
 *   post:
 *     tags: [Informes]
 *     summary: Analiza los datos reales de compras y propone una estructura de bloques (kpi/gráfico/tabla/texto) para el informe (requiere permiso "viewReportes"). Corre como trabajo en segundo plano — consultar el resultado con GET /api/reports/jobs/{jobId}.
 *     responses:
 *       202:
 *         description: Trabajo de sugerencia creado.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties: { jobId: { type: string } }
 *       403:
 *         description: No autorizado.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
export async function POST() {
  const { denied } = await requirePermission("viewReportes");
  if (denied) return denied;

  const jobId = createJob(async () => generateBloquesSugeridos());
  return NextResponse.json({ jobId }, { status: 202 });
}
