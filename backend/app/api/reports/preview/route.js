import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-server";
import { isRoleAllowed } from "@/lib/permissions";
import { generateReportContent } from "@/lib/reportContent";
import { generateReportPdfBuffer } from "@/lib/reportPdf";
import { generateEmailBody } from "@/lib/reportEmailBody";
import { createJob } from "@/lib/reportJobs";

// Arranca (sin guardar nada) la generación de la vista previa del informe a
// partir del prompt como un trabajo en segundo plano — puede tardar hasta
// ~100s con el fallback Gemini→Anthropic (ver lib/aiStructured.js), más de lo
// que el proxy del frontend deja esperar una sola llamada HTTP, así que esta
// ruta solo crea el trabajo y responde con su id; el cliente consulta el
// resultado con /api/reports/jobs/[jobId] (ver lib/api.js#previewReportApi).
export async function POST(request) {
  const user = await getSessionUser();
  if (!user || !(await isRoleAllowed(user.role, "viewReportes"))) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  if (!body.prompt || !String(body.prompt).trim()) {
    return NextResponse.json({ error: "Describe qué debe contener el informe." }, { status: 400 });
  }

  const jobId = createJob(async () => {
    const content = await generateReportContent(body.prompt);
    const [pdfBuffer, emailBody] = await Promise.all([
      generateReportPdfBuffer(content, { nombre: body.nombre, prioridad: body.prioridad || "media" }),
      generateEmailBody({ content, nombre: body.nombre || "Informe", cuerpoModo: body.cuerpoModo || "resumen", cuerpoPrompt: body.cuerpoPrompt }),
    ]);
    return { content, pdfBase64: pdfBuffer.toString("base64"), emailBody };
  });

  return NextResponse.json({ jobId }, { status: 202 });
}
