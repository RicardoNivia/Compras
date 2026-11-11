import { NextResponse } from "next/server";
import { requirePermission, featureDeLinea, apiError } from "@/lib/apiGuard";
import { participacionPorArea } from "@/lib/actividadesBienestar";

/**
 * @openapi
 * /api/actividades/por-area:
 *   get:
 *     tags: [Bienestar]
 *     summary: Participación por área de los participantes en las actividades de un año (filtro Área del cronograma). Solo conteos, sin nombres. Requiere ver la línea.
 *     parameters:
 *       - { in: query, name: anio, schema: { type: integer } }
 *       - { in: query, name: linea, schema: { type: string, enum: [Bienestar, Fundación] } }
 *     responses:
 *       200: { description: "{ areas: [nombre], porArea: { [area]: { [actividadId]: { inscritos, asistentes } } } }" }
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const linea = searchParams.get("linea") || "Bienestar";
  const { denied } = await requirePermission(featureDeLinea("ver", linea));
  if (denied) return denied;
  try {
    return NextResponse.json(await participacionPorArea({ anio: searchParams.get("anio") || undefined, linea }));
  } catch (err) {
    return apiError(err);
  }
}
