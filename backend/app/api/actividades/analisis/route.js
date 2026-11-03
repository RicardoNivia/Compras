import { NextResponse } from "next/server";
import { requirePermission, featureDeLinea, apiError } from "@/lib/apiGuard";
import { obtenerAnalisis, generarAnalisis } from "@/lib/analisisBienestar";

/**
 * @openapi
 * /api/actividades/analisis:
 *   get:
 *     tags: [Bienestar]
 *     summary: Análisis de Nova guardado de una línea (?linea=), año (?anio=) y mes (?mes=1-12; sin mes = el general del año). null si aún no se ha generado. Requiere el dashboard de esa línea.
 *   post:
 *     tags: [Bienestar]
 *     summary: "Resumir de nuevo": genera el análisis con los datos de hoy y reemplaza el guardado. Body { linea, anio, mes }. Requiere poder editar esa línea.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const { denied } = await requirePermission(featureDeLinea("dashboard", searchParams.get("linea")));
  if (denied) return denied;
  try {
    return NextResponse.json({ analisis: await obtenerAnalisis(searchParams.get("linea") || "Bienestar", searchParams.get("anio"), searchParams.get("mes") || 0) });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const { user, denied } = await requirePermission(featureDeLinea("editar", body.linea));
  if (denied) return denied;
  try {
    return NextResponse.json({ analisis: await generarAnalisis({ linea: body.linea || "Bienestar", anio: body.anio, mes: body.mes || 0, actor: user, origen: "manual" }) });
  } catch (err) {
    return apiError(err);
  }
}
