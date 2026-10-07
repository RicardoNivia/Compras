import { NextResponse } from "next/server";
import { updateUser, deleteUser } from "@/lib/users";
import { requirePermission, apiError } from "@/lib/apiGuard";

// Restringido por la funcionalidad "viewUsuarios" de la Matriz de permisos
// (por defecto, solo admin) — ver app/api/users/route.js.

/**
 * @openapi
 * /api/users/{id}:
 *   put:
 *     tags: [Usuarios]
 *     summary: Edita una cuenta de usuario (requiere permiso "viewUsuarios").
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             allOf:
 *               - $ref: '#/components/schemas/User'
 *               - type: object
 *                 properties: { password: { type: string, format: password, description: "Opcional — si se manda, reemplaza la contraseña actual." } }
 *     responses:
 *       200:
 *         description: Usuario actualizado.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/User' }
 *       400:
 *         description: Datos inválidos.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       403:
 *         description: No autorizado.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
export async function PUT(request, { params }) {
  const { user: actor, denied } = await requirePermission("viewUsuarios");
  if (denied) return denied;
  try {
    const body = await request.json();
    const user = await updateUser(params.id, body, actor);
    return NextResponse.json(user);
  } catch (err) {
    return apiError(err);
  }
}

/**
 * @openapi
 * /api/users/{id}:
 *   delete:
 *     tags: [Usuarios]
 *     summary: Elimina una cuenta de usuario (requiere permiso "viewUsuarios").
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Usuario eliminado.
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
  const { user: actor, denied } = await requirePermission("viewUsuarios");
  if (denied) return denied;
  try {
    await deleteUser(params.id, actor);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
