import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-server";
import { isRoleAllowed } from "@/lib/permissions";
import { getReport, markSent } from "@/lib/reports";
import { generateReportContent } from "@/lib/reportContent";
import { generateReportPdfBuffer } from "@/lib/reportPdf";
import { generateEmailBody } from "@/lib/reportEmailBody";
import { sendReportEmail, MAIL_MAINTENANCE, MAIL_MAINTENANCE_MESSAGE } from "@/lib/mailer";
import { logReportSent } from "@/lib/audit";
import { createJob } from "@/lib/reportJobs";

// Envío manual inmediato a los destinatarios configurados del informe (botón
// "Enviar ahora" en la UI) — útil para probar la configuración sin esperar a
// que el scheduler lo dispare (ver lib/reportScheduler.js). Igual que
// preview/route.js, corre como trabajo en segundo plano (puede tardar hasta
// ~100s) y el cliente consulta el resultado vía /api/reports/jobs/[jobId].
export async function POST(request, { params }) {
  const user = await getSessionUser();
  if (!user || !(await isRoleAllowed(user.role, "viewReportes"))) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }
  if (MAIL_MAINTENANCE) {
    return NextResponse.json({ error: MAIL_MAINTENANCE_MESSAGE }, { status: 503 });
  }

  const jobId = createJob(async () => {
    let report;
    try {
      report = await getReport(params.id);
      const content = await generateReportContent(report.prompt);
      const [pdfBuffer, emailBody] = await Promise.all([
        generateReportPdfBuffer(content, { nombre: report.nombre, prioridad: report.prioridad }),
        generateEmailBody({ content, nombre: report.nombre, cuerpoModo: report.cuerpoModo, cuerpoPrompt: report.cuerpoPrompt }),
      ]);
      const destinatarios = JSON.parse(report.destinatarios || "[]");
      const cc = JSON.parse(report.cc || "[]");
      await sendReportEmail({
        to: destinatarios,
        cc,
        subject: content.asunto || report.nombre,
        text: emailBody,
        attachments: [{ filename: `${report.nombre || "Informe"}.pdf`, content: pdfBuffer, contentType: "application/pdf" }],
      });
      await markSent(report.id, content, emailBody);
      await logReportSent(user, report, true).catch(() => {});
      return { ok: true, content, emailBody };
    } catch (err) {
      if (report) await logReportSent(user, report, false, err.message).catch(() => {});
      throw err;
    }
  });

  return NextResponse.json({ jobId }, { status: 202 });
}
