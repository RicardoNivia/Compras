import { NextResponse } from "next/server";
import { requirePermission, apiError } from "@/lib/apiGuard";
import { mcpPermitidoA } from "@/lib/mcpGate";
import { revokeToken } from "@/lib/mcpTokens";
import { mcpNoDisponible } from "@/lib/mcpGate";

/**
 * @openapi
 * /api/tokens/{id}:
 *   delete:
 *     tags: [Claude (MCP)]
 *     summary: Revoca un token (el propio; un admin puede revocar el de cualquiera). Deja de funcionar al instante.
 *     responses:
 *       200: { description: "{ token }" }
 *       404: { description: Token no encontrado. }
 */
export async function DELETE(_request, { params }) {
  const { user, denied } = await requirePermission("viewUsuarios");
  if (denied) return denied;
  if (!mcpPermitidoA(user.role)) return mcpNoDisponible();
  try {
    return NextResponse.json({ token: await revokeToken(user, params.id) });
  } catch (err) {
    return apiError(err);
  }
}
