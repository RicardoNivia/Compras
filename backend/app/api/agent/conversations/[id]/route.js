import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-server";
import { isRoleAllowed } from "@/lib/permissions";
import { getConversation, deleteConversation } from "@/lib/conversations";

/**
 * @openapi
 * /api/agent/conversations/{id}:
 *   get:
 *     tags: [Agente IA]
 *     summary: Obtiene una conversación del Agente IA con todos sus mensajes (requiere permiso "viewAgenteIA"; solo del propio usuario).
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Conversación.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id: { type: string }
 *                 title: { type: string }
 *                 messages:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       role: { type: string, enum: [user, model] }
 *                       text: { type: string }
 *       403:
 *         description: No autorizado.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: Conversación no encontrada.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
export async function GET(_request, { params }) {
  const user = await getSessionUser();
  if (!user || !(await isRoleAllowed(user.role, "viewAgenteIA"))) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }
  const conversation = await getConversation(user.id, params.id);
  if (!conversation) {
    return NextResponse.json({ error: "Conversación no encontrada." }, { status: 404 });
  }
  return NextResponse.json(conversation);
}

/**
 * @openapi
 * /api/agent/conversations/{id}:
 *   delete:
 *     tags: [Agente IA]
 *     summary: Elimina una conversación del Agente IA (requiere permiso "viewAgenteIA"; solo del propio usuario).
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Conversación eliminada.
 *         content:
 *           application/json:
 *             schema: { type: object, properties: { ok: { type: boolean } } }
 *       403:
 *         description: No autorizado.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
export async function DELETE(_request, { params }) {
  const user = await getSessionUser();
  if (!user || !(await isRoleAllowed(user.role, "viewAgenteIA"))) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }
  try {
    await deleteConversation(user.id, params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}
