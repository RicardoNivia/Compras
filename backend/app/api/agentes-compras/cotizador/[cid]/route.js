import { NextResponse } from "next/server";
import { requirePermission, apiError } from "@/lib/apiGuard";
import { eliminarCuadro } from "@/lib/agenteCotizador";

/**
 * @openapi
 * /api/agentes-compras/cotizador/{cid}:
 *   delete:
 *     tags: [Agentes de Compras]
 *     summary: Elimina un cuadro comparativo de Compras (auditado).
 *     responses:
 *       200: { description: "{ ok }" }
 */
export async function DELETE(_request, { params }) {
  const { user, denied } = await requirePermission("viewAgentesCompras");
  if (denied) return denied;
  try {
    await eliminarCuadro(params.cid, user, "compras");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
