import { NextResponse } from "next/server";
import { requirePermission, apiError } from "@/lib/apiGuard";
import { listReports, createReport } from "@/lib/reports";

/**
 * @openapi
 * /api/reports:
 *   get:
 *     tags: [Informes]
 *     summary: Lista los informes automáticos configurados (requiere permiso "viewReportes").
 *     responses:
 *       200:
 *         description: Informes.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 reports:
 *                   type: array
 *                   items: { type: object, description: "Ver cuerpo de POST /api/reports — incluye además ultimoContenido, ultimoCuerpoCorreo, ultimoEnvio, createdByNombre, createdAt, updatedAt." }
 *       403:
 *         description: No autorizado.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
export async function GET() {
  const { denied } = await requirePermission("viewReportes");
  if (denied) return denied;
  const reports = await listReports();
  return NextResponse.json({ reports });
}

/**
 * @openapi
 * /api/reports:
 *   post:
 *     tags: [Informes]
 *     summary: Crea un informe automático (puede guardarse como borrador incompleto; requiere permiso "viewReportes").
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nombre: { type: string }
 *               tipo: { type: string, enum: [bloques, dashboard], default: bloques }
 *               prompt: { type: string, nullable: true, description: "Semilla opcional para generar bloques con IA." }
 *               bloques: { type: array, items: { type: object } }
 *               periodoGeneral: { type: string, enum: [historico, mes_actual, mes_anterior, anio_actual, anio_anterior] }
 *               destinatarios: { type: array, items: { type: string, format: email } }
 *               cc: { type: array, items: { type: string, format: email } }
 *               frecuencia: { type: string, enum: [diaria, semanal, mensual] }
 *               diaSemana: { type: integer, description: "0-6, requerido si frecuencia es semanal." }
 *               diaMes: { type: integer, description: "1-31, requerido si frecuencia es mensual." }
 *               hora: { type: string, description: "Formato HH:mm." }
 *               sabadoHabil: { type: boolean }
 *               domingoHabil: { type: boolean }
 *               cuerpoModo: { type: string, enum: [plano, resumen] }
 *               cuerpoPrompt: { type: string, nullable: true }
 *               cuerpoHtml: { type: string, nullable: true }
 *               esBorrador: { type: boolean, default: false }
 *     responses:
 *       201:
 *         description: Informe creado.
 *         content:
 *           application/json:
 *             schema: { type: object }
 *       400:
 *         description: Datos inválidos.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       403:
 *         description: No autorizado.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
export async function POST(request) {
  const { user, denied } = await requirePermission("viewReportes");
  if (denied) return denied;
  try {
    const body = await request.json();
    const report = await createReport(body, user);
    return NextResponse.json(report, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
