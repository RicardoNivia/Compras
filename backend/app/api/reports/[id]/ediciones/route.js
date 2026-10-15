import { NextResponse } from "next/server";
import { requirePermission, apiError } from "@/lib/apiGuard";
import { getReport } from "@/lib/reports";
import { listEdiciones, generarEdicion, toClientEdicion } from "@/lib/reportEdiciones";
import { createJob } from "@/lib/reportJobs";

/**
 * @openapi
 * /api/reports/{id}/ediciones:
 *   get:
 *     tags: [Informes]
 *     summary: Ediciones archivadas de un informe, de la más reciente a la más antigua, sin el PDF (requiere permiso viewReportes).
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Ediciones.
 *         content:
 *           application/json:
 *             schema: { type: object, properties: { ediciones: { type: array, items: { type: object } } } }
 *   post:
 *     tags: [Informes]
 *     summary: Genera una edición ahora. origen manual queda para enviar como cualquier otra; origen prueba solo le aparece a quien la pidió. Corre en segundo plano (requiere permiso viewReportes).
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string } }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, properties: { origen: { type: string, enum: [manual, prueba] }, referencia: { type: string, description: "YYYY-MM-DD. Genera el envío como si fuera ese día (reponer un período pasado)." } } }
 *     responses:
 *       202:
 *         description: Trabajo creado.
 *         content:
 *           application/json:
 *             schema: { type: object, properties: { jobId: { type: string } } }
 */
export async function GET(request, { params }) {
  const { denied } = await requirePermission("viewReportes");
  if (denied) return denied;
  try {
    return NextResponse.json({ ediciones: await listEdiciones(params.id) });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(request, { params }) {
  const { user, denied } = await requirePermission("viewReportes");
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const origen = ["prueba", "foto"].includes(body.origen) ? body.origen : "manual";
  // referencia (YYYY-MM-DD): generar como si fuera ese día, para reponer un período pasado que no se generó.
  const ahora = /^\d{4}-\d{2}-\d{2}$/.test(body.referencia || "") ? new Date(`${body.referencia}T08:00:00`) : null;
  if (ahora && ahora > new Date()) return NextResponse.json({ error: "La fecha de referencia no puede ser futura." }, { status: 400 });
  try {
    const report = await getReport(params.id);
    const jobId = createJob(async () => {
      const ed = await generarEdicion(report, { origen, actor: user, ahora });
      if (ed.estado === "error") throw new Error(ed.motivo || "No se pudo generar el informe.");
      return { edicion: toClientEdicion(ed, report) };
    });
    return NextResponse.json({ jobId }, { status: 202 });
  } catch (err) {
    return apiError(err);
  }
}
