import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/apiGuard";
import { generateReportContent } from "@/lib/reportContent";
import { generateReportPdfBuffer } from "@/lib/reportPdf";
import { resolveEmailBody } from "@/lib/reportEmailBody";
import { createJob } from "@/lib/reportJobs";
import { opcionesDe } from "@/lib/reportEdiciones";

// Arranca (sin guardar nada) la generación de la vista previa del informe a
// partir del prompt como un trabajo en segundo plano — puede tardar hasta
// ~100s (ver lib/aiStructured.js), más de lo que el proxy del frontend deja
// esperar una sola llamada HTTP, así que esta
// ruta solo crea el trabajo y responde con su id; el cliente consulta el
// resultado con /api/reports/jobs/[jobId] (ver lib/api.js#previewReportApi).
/**
 * @openapi
 * /api/reports/preview:
 *   post:
 *     tags: [Informes]
 *     summary: Genera la vista previa de un informe (PDF + cuerpo de correo) a partir de un prompt y/o bloques, sin guardar nada (requiere permiso "viewReportes"). Corre como trabajo en segundo plano — consultar el resultado con GET /api/reports/jobs/{jobId}.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               prompt: { type: string, nullable: true }
 *               bloques: { type: array, items: { type: object } }
 *               nombre: { type: string }
 *               periodoGeneral: { type: string }
 *               prioridad: { type: string, enum: [alta, media, baja] }
 *               tipo: { type: string, enum: [bloques, dashboard] }
 *               cuerpoHtml: { type: string, nullable: true }
 *               cuerpoModo: { type: string, enum: [plano, resumen] }
 *               cuerpoPrompt: { type: string, nullable: true }
 *     responses:
 *       202:
 *         description: Trabajo de generación creado.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties: { jobId: { type: string } }
 *       400:
 *         description: Falta describir el informe (prompt o bloques).
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
  const hasPrompt = !!(body.prompt && String(body.prompt).trim());
  const hasBloques = Array.isArray(body.bloques) && body.bloques.length > 0;
  if (!hasPrompt && !hasBloques) {
    return NextResponse.json({ error: "Describe qué debe contener el informe (prompt) o agrega al menos un bloque." }, { status: 400 });
  }

  // Estudio de informes: el editor solo necesita el contenido (lo dibuja en pantalla); el PDF se pide aparte al abrir
  // la vista previa (render-pdf), así cada cambio en el editor responde rápido.
  if (body.tipo === "estudio") {
    const opts = opcionesDe(body);
    const jobId = createJob(async () => {
      const content = await generateReportContent(opts.contenido);
      if (body.soloContenido) return { content };
      const pdfBuffer = await generateReportPdfBuffer(content, opts.pdf);
      return { content, pdfBase64: pdfBuffer.toString("base64") };
    });
    return NextResponse.json({ jobId }, { status: 202 });
  }

  const jobId = createJob(async () => {
    const content = await generateReportContent({ prompt: body.prompt, bloques: body.bloques, nombre: body.nombre, periodoGeneral: body.periodoGeneral });
    const [pdfBuffer, cuerpo] = await Promise.all([
      generateReportPdfBuffer(content, { nombre: body.nombre, prioridad: body.prioridad || "media", dashboardLayout: body.tipo === "dashboard" }),
      resolveEmailBody({ cuerpoHtml: body.cuerpoHtml, content, nombre: body.nombre || "Informe", cuerpoModo: body.cuerpoModo || "resumen", cuerpoPrompt: body.cuerpoPrompt }),
    ]);
    return { content, pdfBase64: pdfBuffer.toString("base64"), emailBody: cuerpo.text };
  });

  return NextResponse.json({ jobId }, { status: 202 });
}
