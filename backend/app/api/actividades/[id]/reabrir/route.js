import { NextResponse } from "next/server";
import { requirePermisoActividad, apiError } from "@/lib/apiGuard";
import { reabrirActividad } from "@/lib/reabrirActividad";

/**
 * @openapi
 * /api/actividades/{id}/reabrir:
 *   post:
 *     tags: [Bienestar]
 *     summary: Reabre una actividad cerrada (vuelve a «ejecutada» para poder modificarla o eliminarla). Body { motivo } obligatorio; queda en Auditoría. Requiere editBienestar.
 *     responses:
 *       200: { description: "{ actividad }" }
 *       409: { description: La actividad no está cerrada. }
 */
export async function POST(request, { params }) {
  const { user, denied } = await requirePermisoActividad(params.id, "editar");
  if (denied) return denied;
  try {
    const body = await request.json().catch(() => ({}));
    return NextResponse.json({ actividad: await reabrirActividad(params.id, body, user) });
  } catch (err) {
    return apiError(err);
  }
}
