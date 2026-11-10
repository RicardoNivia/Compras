import { NextResponse } from "next/server";
import { requirePermisoActividad, apiError } from "@/lib/apiGuard";
import { eliminarObservacion } from "@/lib/observacionesActividad";

/**
 * @openapi
 * /api/actividades/{id}/observaciones/{oid}:
 *   delete:
 *     tags: [Bienestar]
 *     summary: Quita una observación del equipo. Requiere editar la línea.
 *     responses:
 *       200: { description: "{ ok: true }" }
 */
export async function DELETE(_request, { params }) {
  const { user, denied } = await requirePermisoActividad(params.id, "editar");
  if (denied) return denied;
  try {
    await eliminarObservacion(params.id, params.oid, user);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
