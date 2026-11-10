import { NextResponse } from "next/server";
import { requirePermission, featureDeLinea, apiError } from "@/lib/apiGuard";
import { resumenBienestar } from "@/lib/actividadesBienestar";

/**
 * @openapi
 * /api/actividades/resumen:
 *   get:
 *     tags: [Bienestar]
 *     summary: Dashboard de una línea (?linea=Bienestar|Fundación) del año (?anio=) — participación de las actividades cruzada con el gasto de Compras (área Bienestar y compras asociadas), por mes, por categoría y costo por asistente. Requiere el dashboard de esa línea.
 *     responses:
 *       200: { description: "{ resumen: { kpis, porMes, categorias, costoPorActividad, proximas } }" }
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const { denied } = await requirePermission(featureDeLinea("dashboard", searchParams.get("linea")));
  if (denied) return denied;
  try {
    return NextResponse.json({ resumen: await resumenBienestar(searchParams.get("anio"), searchParams.get("linea") || "Bienestar", searchParams.get("mes")) });
  } catch (err) {
    return apiError(err);
  }
}
