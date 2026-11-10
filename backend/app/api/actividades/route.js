import { NextResponse } from "next/server";
import { requirePermission, featureDeLinea, apiError } from "@/lib/apiGuard";
import { listActividades, createActividad } from "@/lib/actividadesBienestar";

// Leer no exige más que estar autenticado (lo garantiza el middleware): el formulario de Compras necesita la lista
// para asociar una compra a su actividad, igual que con los maestros.
/**
 * @openapi
 * /api/actividades:
 *   get:
 *     tags: [Bienestar]
 *     summary: Actividades de Bienestar del año (por su fecha) más las que aún no tienen fecha, con el gasto de sus compras asociadas.
 *     parameters:
 *       - { in: query, name: anio, schema: { type: integer }, description: "Año; sin él, todas." }
 *       - { in: query, name: linea, schema: { type: string, enum: [Bienestar, Fundación] }, description: "Solo las de esa línea." }
 *     responses:
 *       200: { description: "{ actividades: [{ id, nombre, fecha, linea, estado, presupuesto, inscritos, asistentes, compras, gastado, pctPresupuesto, ... }] }" }
 *   post:
 *     tags: [Bienestar]
 *     summary: Crea una actividad (nombre, fecha, linea, estado creada|programada|ejecutada|cerrada, presupuesto, inscritos, asistentes, responsableUserId...). Requiere editBienestar.
 *     responses:
 *       201: { description: Actividad creada. }
 *       400: { description: Datos inválidos (p. ej. una actividad programada sin fecha). }
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const anio = searchParams.get("anio") || undefined;
  const linea = searchParams.get("linea") || undefined;
  try {
    return NextResponse.json({ actividades: await listActividades({ anio, linea }) });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const { user, denied } = await requirePermission(featureDeLinea("editar", body.linea));
  if (denied) return denied;
  try {
    const actividad = await createActividad(body, user);
    return NextResponse.json(actividad, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
