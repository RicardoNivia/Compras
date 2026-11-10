import { NextResponse } from "next/server";
import { requirePermisoActividad, apiError } from "@/lib/apiGuard";
import { listObservaciones, crearObservacion } from "@/lib/observacionesActividad";

/**
 * @openapi
 * /api/actividades/{id}/observaciones:
 *   get:
 *     tags: [Bienestar]
 *     summary: Calificaciones y observaciones de la actividad (equipo, participantes, formulario y cierre). Requiere ver la línea.
 *     responses:
 *       200: { description: "{ observaciones, resumen }" }
 *   post:
 *     tags: [Bienestar]
 *     summary: Agrega una observación del equipo ({ texto }). Requiere editar la línea.
 *     responses:
 *       201: { description: "{ observacion }" }
 */
export async function GET(_request, { params }) {
  const { denied } = await requirePermisoActividad(params.id, "ver");
  if (denied) return denied;
  try {
    return NextResponse.json(await listObservaciones(params.id));
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(request, { params }) {
  const { user, denied } = await requirePermisoActividad(params.id, "editar");
  if (denied) return denied;
  try {
    return NextResponse.json({ observacion: await crearObservacion(params.id, await request.json(), user) }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
