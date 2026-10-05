import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-server";
import { isRoleAllowed } from "@/lib/permissions";
import { generateCuerpoCorreoSugerido } from "@/lib/reportEmailBody";
import { createJob } from "@/lib/reportJobs";

// Botón "IA" del editor del cuerpo del correo (ver ReportBodyEditor.jsx): no
// genera nada desde cero — valida/reescribe el texto que el usuario YA
// escribió y le propone una redacción alternativa, que el usuario decide si
// aplica o descarta. Mismo patrón de trabajo en segundo plano que
// preview/route.js (puede tardar hasta ~100s con el fallback Gemini→Anthropic).
export async function POST(request) {
  const user = await getSessionUser();
  if (!user || !(await isRoleAllowed(user.role, "viewReportes"))) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  if (!body.texto || !String(body.texto).trim()) {
    return NextResponse.json({ error: "Escribe algo en el cuerpo del correo antes de pedirle a la IA que lo mejore." }, { status: 400 });
  }

  const jobId = createJob(async () => generateCuerpoCorreoSugerido(body.texto));
  return NextResponse.json({ jobId }, { status: 202 });
}
