import { NextResponse } from "next/server";
import { requirePermisoActividad, apiError } from "@/lib/apiGuard";
import { resumenEliminacion } from "@/lib/actividadesBienestar";

/**
 * @openapi
 * /api/actividades/{id}/eliminacion:
 *   get:
 *     tags: [Bienestar]
 *     summary: Qué se borraría al eliminar la actividad (participantes, fotos, inventario, lo que vuelve a la bodega) y si se puede (no con compras asociadas ni cerrada). Requiere editBienestar.
 *     responses:
 *       200: { description: "{ sePuede, motivo, compras, participantes, fotos, inventario, vuelvenABodega, ... }" }
 */
export async function GET(_request, { params }) {
  const { denied } = await requirePermisoActividad(params.id, "editar");
  if (denied) return denied;
  try {
    return NextResponse.json(await resumenEliminacion(params.id));
  } catch (err) {
    return apiError(err);
  }
}
