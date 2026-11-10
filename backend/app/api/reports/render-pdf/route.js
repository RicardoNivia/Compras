import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/apiGuard";
import { generateReportPdfBuffer } from "@/lib/reportPdf";
import { opcionesDe } from "@/lib/reportEdiciones";

// Vuelve a dibujar el PDF a partir de un contenido YA GENERADO (sin llamar a
// la IA) — se usa al abrir "Editar informe" para mostrar de nuevo el mismo
// PDF que se había guardado la última vez, sin esperar una nueva generación.
// Es puro pdfkit (sin red), así que responde al instante — no necesita el
// patrón de trabajo en segundo plano de preview/route.js.
/**
 * @openapi
 * /api/reports/render-pdf:
 *   post:
 *     tags: [Informes]
 *     summary: Vuelve a dibujar el PDF a partir de un contenido ya generado, sin llamar a la IA (requiere permiso "viewReportes"). Responde al instante, no usa el patrón de trabajo en segundo plano.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [content]
 *             properties:
 *               content: { type: object, description: "Contenido ya generado del informe (ver generateReportContent)." }
 *               nombre: { type: string }
 *               tipo: { type: string, enum: [bloques, dashboard] }
 *     responses:
 *       200:
 *         description: PDF generado.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties: { pdfBase64: { type: string, description: "PDF codificado en base64." } }
 *       400:
 *         description: Falta el contenido del informe.
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
  if (!body.content) {
    return NextResponse.json({ error: "Falta el contenido del informe." }, { status: 400 });
  }
  try {
    const pdfOpts = body.tipo === "estudio" ? opcionesDe(body).pdf : { nombre: body.nombre, dashboardLayout: body.tipo === "dashboard" };
    const pdfBuffer = await generateReportPdfBuffer(body.content, pdfOpts);
    return NextResponse.json({ pdfBase64: pdfBuffer.toString("base64") });
  } catch (err) {
    return NextResponse.json({ error: err.message || "No se pudo generar el PDF." }, { status: 500 });
  }
}
