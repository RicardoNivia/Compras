import { NextResponse } from "next/server";
import { authenticateBearer } from "@/lib/mcpTokens";
import { handleMcpMessage } from "@/lib/mcpServer";
import { checkRateLimit, recordAttempt } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const LIMITE = { max: 60, windowMs: 60 * 1000 }; // 60 mensajes por minuto y por persona

const rpcError = (code, message, status) => NextResponse.json({ jsonrpc: "2.0", id: null, error: { code, message } }, { status });

/**
 * @openapi
 * /api/mcp:
 *   post:
 *     tags: [Claude (MCP)]
 *     summary: Servidor MCP de solo lectura (JSON-RPC sobre HTTP). Se autentica con un token personal en "Authorization Bearer", creado en la página "Conectar con Claude". Herramientas - mis_pendientes, buscar_registros, resumen_compras, consultar_proveedor, estado_presupuesto.
 *     responses:
 *       200: { description: Respuesta JSON-RPC. }
 *       202: { description: Notificación recibida (sin respuesta). }
 *       401: { description: Token ausente, inválido, vencido o revocado. }
 */
export async function POST(request) {
  const auth = request.headers.get("authorization") || "";
  const user = await authenticateBearer(auth.startsWith("Bearer ") ? auth.slice(7).trim() : "");
  if (!user) {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32001, message: "Token inválido, vencido o revocado. Genera uno nuevo en «Conectar con Claude»." } },
      { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="panel-compras"' } }
    );
  }
  const key = `mcp:${user.id}`;
  const lim = checkRateLimit(key, LIMITE);
  if (!lim.allowed) return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32003, message: "Demasiadas consultas; espera un momento." } }, { status: 429, headers: { "Retry-After": String(lim.retryAfterSeconds) } });
  recordAttempt(key, LIMITE);

  let body;
  try {
    body = await request.json();
  } catch {
    return rpcError(-32700, "JSON inválido.", 400);
  }

  if (Array.isArray(body)) {
    const respuestas = (await Promise.all(body.slice(0, 20).map((m) => handleMcpMessage(user, m)))).filter(Boolean);
    return respuestas.length ? NextResponse.json(respuestas) : new NextResponse(null, { status: 202 });
  }
  const respuesta = await handleMcpMessage(user, body);
  return respuesta ? NextResponse.json(respuesta) : new NextResponse(null, { status: 202 });
}

// Este servidor no abre flujos SSE: el cliente solo usa POST.
export async function GET() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}
