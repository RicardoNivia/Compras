import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/apiGuard";
import { generateCuerpoCorreoSugerido } from "@/lib/reportEmailBody";
import { createJob } from "@/lib/reportJobs";

// Botón "IA" del editor del cuerpo del correo (ver ReportBodyEditor.jsx): no
// genera nada desde cero — valida/reescribe el texto que el usuario YA
// escribió y le propone una redacción alternativa, que el usuario decide si
// aplica o descarta. Mismo patrón de trabajo en segundo plano que
// preview/route.js (puede tardar hasta ~100s, ver lib/aiStructured.js).
/**
 * @openapi
 * /api/reports/cuerpo-ia:
 *   post:
 *     tags: [Informes]
 *     summary: Reescribe con IA el texto que el usuario ya escribió para el cuerpo del correo del informe (requiere permiso "viewReportes"). Corre como trabajo en segundo plano — consultar el resultado con GET /api/reports/jobs/{jobId}.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [texto]
 *             properties: { texto: { type: string } }
 *     responses:
 *       202:
 *         description: Trabajo de redacción creado.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties: { jobId: { type: string } }
 *       400:
 *         description: Falta el texto a mejorar.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       403:
 *         description: No autorizado.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
export async function POST(request) {
  const { denied } = await requirePermission("viewReportes");
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  if (!body.texto || !String(body.texto).trim()) {
    return NextResponse.json({ error: "Escribe algo en el cuerpo del correo antes de pedirle a la IA que lo mejore." }, { status: 400 });
  }

  const jobId = createJob(async () => generateCuerpoCorreoSugerido(body.texto));
  return NextResponse.json({ jobId }, { status: 202 });
}
