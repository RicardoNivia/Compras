import { NextResponse } from "next/server";
import { requireAlgunPermiso, apiError } from "@/lib/apiGuard";
import { eliminarCuadro } from "@/lib/agenteCotizador";

/**
 * @openapi
 * /api/actividades/agentes/cotizador/{cid}:
 *   delete:
 *     tags: [Bienestar]
 *     summary: Elimina un cuadro comparativo (auditado). Requiere editar Bienestar o Fundación.
 *     responses:
 *       200: { description: "{ ok: true }" }
 */
export async function DELETE(_request, { params }) {
  const { user, denied } = await requireAlgunPermiso(["editBienestar", "editFundacion"]);
  if (denied) return denied;
  try {
    await eliminarCuadro(params.cid, user);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
