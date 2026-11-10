import { NextResponse } from "next/server";
import { requirePermission, apiError } from "@/lib/apiGuard";
import { mcpPermitidoA } from "@/lib/mcpGate";
import { listTokens, createToken } from "@/lib/mcpTokens";
import { mcpNoDisponible } from "@/lib/mcpGate";

/**
 * @openapi
 * /api/tokens:
 *   get:
 *     tags: [Claude (MCP)]
 *     summary: Lista los tokens personales de la persona conectada (un admin puede pasar todos=1 para ver los de todos). Nunca devuelve el token. Solo para usuarios admin y solo en local.
 *     responses:
 *       200: { description: "{ tokens: [...] }" }
 *   post:
 *     tags: [Claude (MCP)]
 *     summary: Crea un token personal ({ nombre, diasVigencia }). El token en claro se devuelve UNA sola vez en esta respuesta.
 *     responses:
 *       200: { description: "{ token: { token, id, nombre, ... } }" }
 */
export async function GET(request) {
  const { user, denied } = await requirePermission("viewUsuarios");
  if (denied) return denied;
  if (!mcpPermitidoA(user.role)) return mcpNoDisponible();
  try {
    const todos = new URL(request.url).searchParams.get("todos") === "1";
    return NextResponse.json({ tokens: await listTokens(user, { todos }) });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(request) {
  const { user, denied } = await requirePermission("viewUsuarios");
  if (denied) return denied;
  if (!mcpPermitidoA(user.role)) return mcpNoDisponible();
  try {
    return NextResponse.json({ token: await createToken(user, await request.json()) });
  } catch (err) {
    return apiError(err);
  }
}
