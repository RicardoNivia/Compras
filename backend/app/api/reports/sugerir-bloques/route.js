import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-server";
import { isRoleAllowed } from "@/lib/permissions";
import { generateBloquesSugeridos } from "@/lib/reportContent";
import { createJob } from "@/lib/reportJobs";

// Botón "Armar informe automáticamente con IA" (sin prompt, sin bloques
// previos): analiza los datos reales de compras y propone una estructura de
// bloques (kpi/grafico/tabla/texto) — la IA solo decide QUÉ mostrar, nunca
// calcula las cifras (esas se calculan después, de forma determinística, al
// renderizar cada bloque). Mismo patrón de trabajo en segundo plano que
// preview/route.js.
export async function POST() {
  const user = await getSessionUser();
  if (!user || !(await isRoleAllowed(user.role, "viewReportes"))) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const jobId = createJob(async () => generateBloquesSugeridos());
  return NextResponse.json({ jobId }, { status: 202 });
}
