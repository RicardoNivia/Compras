import { NextResponse } from "next/server";
import { requirePermission, apiError } from "@/lib/apiGuard";
import { cifraDetalle } from "@/lib/reportContent";

/**
 * @openapi
 * /api/reports/cifra:
 *   post:
 *     tags: [Informes]
 *     summary: Explica de dónde sale una cifra del informe. Fórmula, filtro, registros que la forman, detalle por área y valor del período anterior. Determinístico, sin IA (requiere permiso viewReportes).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               metrica: { type: string }
 *               periodo: { type: string }
 *               excluirAnulados: { type: boolean }
 *               agruparPor: { type: string, description: "Con etiqueta, explica una barra o porción de una gráfica." }
 *               etiqueta: { type: string }
 *     responses:
 *       200:
 *         description: Detalle de la cifra.
 *         content:
 *           application/json:
 *             schema: { type: object }
 */
export async function POST(request) {
  const { denied } = await requirePermission("viewReportes");
  if (denied) return denied;
  try {
    const b = await request.json().catch(() => ({}));
    return NextResponse.json(await cifraDetalle({ metrica: b.metrica, periodo: b.periodo, excluirAnulados: b.excluirAnulados !== false, filtros: b.filtros || null, agruparPor: b.agruparPor, etiqueta: b.etiqueta }));
  } catch (err) {
    return apiError(err);
  }
}
