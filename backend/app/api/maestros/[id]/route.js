import { NextResponse } from "next/server";
import { updateMaestro, deleteMaestro } from "@/lib/maestros";
import { requireAlgunPermiso, apiError } from "@/lib/apiGuard";

/**
 * @openapi
 * /api/maestros/{id}:
 *   patch:
 *     tags: [Maestros]
 *     summary: Edita un valor de lista maestra — activo/inactivo, o el texto del valor si no está en uso (requiere permiso "viewMaestros").
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               valor: { type: string }
 *               activo: { type: boolean }
 *     responses:
 *       200:
 *         description: Maestro actualizado.
 *         content:
 *           application/json:
 *             schema: { type: object, description: "Ver schema de maestro en GET /api/maestros." }
 *       400:
 *         description: Datos inválidos, o valor ya existente para ese tipo.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       403:
 *         description: No autorizado.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: Maestro no encontrado.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       409:
 *         description: El valor ya está en uso en registros existentes, no se puede editar.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
export async function PATCH(request, { params }) {
  const { user, denied } = await requireAlgunPermiso(["viewMaestros", "viewMaestrosBienestar"]);
  if (denied) return denied;
  try {
    const body = await request.json();
    const maestro = await updateMaestro(params.id, body, user);
    return NextResponse.json(maestro);
  } catch (err) {
    return apiError(err);
  }
}

/**
 * @openapi
 * /api/maestros/{id}:
 *   delete:
 *     tags: [Maestros]
 *     summary: Elimina un valor de lista maestra, si no está en uso en ningún registro (requiere permiso "viewMaestros").
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Maestro eliminado.
 *         content:
 *           application/json:
 *             schema: { type: object, properties: { ok: { type: boolean } } }
 *       403:
 *         description: No autorizado.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: Maestro no encontrado.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       409:
 *         description: El valor ya está en uso en registros existentes, no se puede eliminar.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
export async function DELETE(_request, { params }) {
  const { user, denied } = await requireAlgunPermiso(["viewMaestros", "viewMaestrosBienestar"]);
  if (denied) return denied;
  try {
    await deleteMaestro(params.id, user);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
