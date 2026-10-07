import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/apiGuard";
import { getReport, markSent } from "@/lib/reports";
import { generateReportContent } from "@/lib/reportContent";
import { generateReportPdfBuffer } from "@/lib/reportPdf";
import { resolveEmailBody } from "@/lib/reportEmailBody";
import { sendReportEmail, MAIL_MAINTENANCE, MAIL_MAINTENANCE_MESSAGE } from "@/lib/mailer";
import { logReportSent } from "@/lib/audit";
import { createJob } from "@/lib/reportJobs";

// Envío manual inmediato a los destinatarios configurados del informe (botón
// "Enviar ahora" en la UI) — útil para probar la configuración sin esperar a
// que el scheduler lo dispare (ver lib/reportScheduler.js). Igual que
// preview/route.js, corre como trabajo en segundo plano (puede tardar hasta
// ~100s) y el cliente consulta el resultado vía /api/reports/jobs/[jobId].
/**
 * @openapi
 * /api/reports/{id}/send-now:
 *   post:
 *     tags: [Informes]
 *     summary: Envía de inmediato un informe ya guardado a sus destinatarios (requiere permiso "viewReportes"). Corre como trabajo en segundo plano — consultar el resultado con GET /api/reports/jobs/{jobId}.
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string } }
 *     responses:
 *       202:
 *         description: Trabajo de envío creado.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties: { jobId: { type: string } }
 *       400:
 *         description: El informe es un borrador incompleto, no se puede enviar.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       403:
 *         description: No autorizado.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       503:
 *         description: Envío de correo en mantenimiento.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
export async function POST(request, { params }) {
  const { user, denied } = await requirePermission("viewReportes");
  if (denied) return denied;
  if (MAIL_MAINTENANCE) {
    return NextResponse.json({ error: MAIL_MAINTENANCE_MESSAGE }, { status: 503 });
  }

  const existing = await getReport(params.id).catch(() => null);
  if (existing?.esBorrador) {
    return NextResponse.json({ error: "Este informe es un borrador — complétalo y guárdalo como informe antes de enviarlo." }, { status: 400 });
  }

  const jobId = createJob(async () => {
    let report;
    try {
      report = await getReport(params.id);
      const content = await generateReportContent({ prompt: report.prompt, bloques: report.bloques, nombre: report.nombre, periodoGeneral: report.periodoGeneral });
      const [pdfBuffer, cuerpo] = await Promise.all([
        generateReportPdfBuffer(content, { nombre: report.nombre, prioridad: report.prioridad, dashboardLayout: report.tipo === "dashboard" }),
        resolveEmailBody({ cuerpoHtml: report.cuerpoHtml, content, nombre: report.nombre, cuerpoModo: report.cuerpoModo, cuerpoPrompt: report.cuerpoPrompt }),
      ]);
      const destinatarios = JSON.parse(report.destinatarios || "[]");
      const cc = JSON.parse(report.cc || "[]");
      await sendReportEmail({
        to: destinatarios,
        cc,
        subject: content.asunto || report.nombre,
        text: cuerpo.text,
        html: cuerpo.html,
        attachments: [{ filename: `${report.nombre || "Informe"}.pdf`, content: pdfBuffer, contentType: "application/pdf" }],
      });
      await markSent(report.id, content, cuerpo.text);
      await logReportSent(user, report, true).catch(() => {});
      return { ok: true, content, emailBody: cuerpo.text };
    } catch (err) {
      if (report) await logReportSent(user, report, false, err.message).catch(() => {});
      throw err;
    }
  });

  return NextResponse.json({ jobId }, { status: 202 });
}
