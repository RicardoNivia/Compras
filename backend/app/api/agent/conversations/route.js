import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-server";
import { isRoleAllowed } from "@/lib/permissions";
import { listConversations } from "@/lib/conversations";

/**
 * @openapi
 * /api/agent/conversations:
 *   get:
 *     tags: [Agente IA]
 *     summary: Lista las conversaciones del usuario autenticado con el Agente IA (requiere permiso "viewAgenteIA").
 *     responses:
 *       200:
 *         description: Conversaciones.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 conversations:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: string }
 *                       title: { type: string }
 *                       createdAt: { type: string, format: date-time }
 *                       updatedAt: { type: string, format: date-time }
 *       403:
 *         description: No autorizado.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user || !(await isRoleAllowed(user.role, "viewAgenteIA"))) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }
  const conversations = await listConversations(user.id);
  return NextResponse.json({ conversations });
}
