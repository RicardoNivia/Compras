import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-server";
import { isRoleAllowed } from "@/lib/permissions";
import { getJob } from "@/lib/reportJobs";

// Consulta genérica de estado para trabajos en segundo plano de Informes
// (preview y send-now, ver sus route.js) — ver lib/reportJobs.js.
export async function GET(request, { params }) {
  const user = await getSessionUser();
  if (!user || !(await isRoleAllowed(user.role, "viewReportes"))) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }
  const job = getJob(params.jobId);
  if (!job) return NextResponse.json({ error: "Trabajo no encontrado o expirado." }, { status: 404 });

  if (job.status === "pending") return NextResponse.json({ status: "pending" });
  if (job.status === "error") return NextResponse.json({ status: "error", error: job.error });
  return NextResponse.json({ status: "done", result: job.result });
}
