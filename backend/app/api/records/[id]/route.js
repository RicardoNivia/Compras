import { NextResponse } from "next/server";
import { updateRecord, patchRecord, deleteRecord } from "@/lib/records";
import { getEditableFields, getPatchableFields } from "@/lib/roles";
import { requirePermission, apiError } from "@/lib/apiGuard";

/**
 * @openapi
 * /api/records/{id}:
 *   put:
 *     tags: [Registros]
 *     summary: Edita un registro de compra completo (requiere permiso "editRecord"; los campos editables dependen del rol).
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/Record' }
 *     responses:
 *       200:
 *         description: Registro actualizado.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Record' }
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
  const { user, denied } = await requirePermission("editRecord");
  if (denied) return denied;
  try {
    const body = await request.json();
    const record = await updateRecord(params.id, body, user, { fields: getEditableFields(user.role) });
    return NextResponse.json(record);
  } catch (err) {
    return apiError(err);
  }
}

/**
 * @openapi
 * /api/records/{id}:
 *   patch:
 *     tags: [Registros]
 *     summary: Actualización parcial de un registro (usada para el toggle de "radicado"; requiere permiso "toggleRadicado").
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties: { radicado: { type: boolean } }
 *     responses:
 *       200:
 *         description: Registro actualizado.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Record' }
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
// Actualización parcial (usada para el toggle de "radicado").
export async function PATCH(request, { params }) {
  const { user, denied } = await requirePermission("toggleRadicado");
  if (denied) return denied;
  try {
    const body = await request.json();
    const record = await patchRecord(params.id, body, user, { fields: getPatchableFields(user.role) });
    return NextResponse.json(record);
  } catch (err) {
    return apiError(err);
  }
}

/**
 * @openapi
 * /api/records/{id}:
 *   delete:
 *     tags: [Registros]
 *     summary: Elimina un registro de compra (requiere permiso "deleteRecord").
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Registro eliminado.
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
  const { user, denied } = await requirePermission("deleteRecord");
  if (denied) return denied;
  try {
    await deleteRecord(params.id, user);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
