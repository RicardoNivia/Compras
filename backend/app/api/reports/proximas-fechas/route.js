import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/apiGuard";
import { FRECUENCIAS, proximasFechas, describirProgramacion } from "@/lib/reportSchedule";

/**
 * @openapi
 * /api/reports/proximas-fechas:
 *   post:
 *     tags: [Informes]
 *     summary: Próximas 5 fechas de generación de una regla de programación, saltando festivos colombianos (requiere permiso viewReportes).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               frecuencia: { type: string }
 *               diaSemana: { type: integer }
 *               diaMes: { type: integer }
 *               ordinal: { type: integer }
 *               fechaUnica: { type: string }
 *               hora: { type: string }
 *               saltarFestivos: { type: boolean }
 *     responses:
 *       200:
 *         description: Fechas y descripción de la regla.
 *         content:
 *           application/json:
 *             schema: { type: object }
 */
export async function POST(request) {
  const { denied } = await requirePermission("viewReportes");
  if (denied) return denied;
  const b = await request.json().catch(() => ({}));
  if (!FRECUENCIAS.includes(b.frecuencia)) return NextResponse.json({ error: "Frecuencia inválida." }, { status: 400 });
  const regla = {
    frecuencia: b.frecuencia,
    diaSemana: b.diaSemana != null ? Number(b.diaSemana) : null,
    diaMes: b.diaMes != null ? Number(b.diaMes) : null,
    ordinal: b.ordinal != null ? Number(b.ordinal) : null,
    fechaUnica: b.fechaUnica || null,
    hora: /^([01]\d|2[0-3]):[0-5]\d$/.test(b.hora || "") ? b.hora : "08:00",
    saltarFestivos: b.saltarFestivos !== false,
    sabadoHabil: !!b.sabadoHabil,
    domingoHabil: !!b.domingoHabil,
  };
  return NextResponse.json({ descripcion: describirProgramacion(regla), proximas: proximasFechas(regla, Number(b.n) || 5) });
}
