import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-server";
import { apiError } from "@/lib/apiGuard";
import { getCompartido, contenidoCompartido } from "@/lib/reportCompartidos";
import { createJob } from "@/lib/reportJobs";

/**
 * @openapi
 * /api/reports/compartidos/{id}:
 *   get:
 *     tags: [Informes]
 *     summary: Datos básicos de un informe solo para consultar, si el usuario tiene acceso.
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Informe.
 *         content:
 *           application/json:
 *             schema: { type: object }
 *       403:
 *         description: Sin acceso.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *   post:
 *     tags: [Informes]
 *     summary: Calcula el contenido del informe con los datos de hoy. Corre en segundo plano; el resultado se consulta en /api/reports/jobs/{jobId}.
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string } }
 *     responses:
 *       202:
 *         description: Trabajo creado.
 *         content:
 *           application/json:
 *             schema: { type: object, properties: { jobId: { type: string } } }
 */
export async function GET(request, { params }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  try {
    const { resumen } = await getCompartido(params.id, user);
    return NextResponse.json(resumen);
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(request, { params }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  try {
    const { report } = await getCompartido(params.id, user);
    const jobId = createJob(async () => ({ content: await contenidoCompartido(report), generadoAt: new Date().toISOString() }), user.id);
    return NextResponse.json({ jobId }, { status: 202 });
  } catch (err) {
    return apiError(err);
  }
}
