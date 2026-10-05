import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-server";
import { isRoleAllowed } from "@/lib/permissions";
import { generateBloqueIaContent } from "@/lib/reportContent";
import { createJob } from "@/lib/reportJobs";

// Genera (o regenera) el contenido de UN bloque tipo "ia" dentro del
// constructor por bloques del informe (ver ReportBloqueBuilder.jsx) — no
// guarda nada, solo devuelve el texto para que el usuario lo vea y decida si
// lo deja en el bloque antes de guardar el informe completo. Igual que
// preview/route.js, corre como trabajo en segundo plano por si tarda más de
// lo que el proxy del frontend deja esperar en una sola llamada.
export async function POST(request) {
  const user = await getSessionUser();
  if (!user || !(await isRoleAllowed(user.role, "viewReportes"))) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  if (!body.pregunta || !String(body.pregunta).trim()) {
    return NextResponse.json({ error: "Escribe la pregunta para este bloque." }, { status: 400 });
  }

  const jobId = createJob(async () => generateBloqueIaContent(body.pregunta));
  return NextResponse.json({ jobId }, { status: 202 });
}
