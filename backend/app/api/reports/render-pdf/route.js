import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-server";
import { isRoleAllowed } from "@/lib/permissions";
import { generateReportPdfBuffer } from "@/lib/reportPdf";

// Vuelve a dibujar el PDF a partir de un contenido YA GENERADO (sin llamar a
// la IA) — se usa al abrir "Editar informe" para mostrar de nuevo el mismo
// PDF que se había guardado la última vez, sin esperar una nueva generación.
// Es puro pdfkit (sin red), así que responde al instante — no necesita el
// patrón de trabajo en segundo plano de preview/route.js.
export async function POST(request) {
  const user = await getSessionUser();
  if (!user || !(await isRoleAllowed(user.role, "viewReportes"))) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  if (!body.content) {
    return NextResponse.json({ error: "Falta el contenido del informe." }, { status: 400 });
  }
  try {
    const pdfBuffer = await generateReportPdfBuffer(body.content, { nombre: body.nombre });
    return NextResponse.json({ pdfBase64: pdfBuffer.toString("base64") });
  } catch (err) {
    return NextResponse.json({ error: err.message || "No se pudo generar el PDF." }, { status: 500 });
  }
}
