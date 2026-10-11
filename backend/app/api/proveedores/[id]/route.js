import { NextResponse } from "next/server";
import { updateProveedor, deleteProveedor } from "@/lib/proveedores";
import { getProveedorDetalle } from "@/lib/proveedoresCiclo";
import { requirePermission, apiError } from "@/lib/apiGuard";

/**
 * @openapi
 * /api/proveedores/{id}:
 *   patch:
 *     tags: [Proveedores]
 *     summary: Edita un proveedor — nombre, nit, descripción, contacto o activo/inactivo (requiere permiso "viewMaestros"). El código (referencia real usada por los registros) nunca cambia, así que nit/nombre se pueden corregir libremente aunque el proveedor esté en uso.
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nit: { type: string }
 *               nombre: { type: string }
 *               descripcion: { type: string }
 *               telefono: { type: string }
 *               correo: { type: string }
 *               activo: { type: boolean }
 *     responses:
 *       200:
 *         description: Proveedor actualizado.
 *         content:
 *           application/json:
 *             schema: { type: object, description: "Ver schema de proveedor en GET /api/proveedores." }
 *       400:
 *         description: Datos inválidos, o nit ya existente.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       403:
 *         description: No autorizado.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: Proveedor no encontrado.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
export async function PATCH(request, { params }) {
  const { user, denied } = await requirePermission("editProveedores");
  if (denied) return denied;
  try {
    const body = await request.json();
    const proveedor = await updateProveedor(params.id, body, user);
    return NextResponse.json(proveedor);
  } catch (err) {
    return apiError(err);
  }
}

/**
 * @openapi
 * /api/proveedores/{id}:
 *   delete:
 *     tags: [Proveedores]
 *     summary: Elimina un proveedor, si no está en uso en ningún registro (requiere permiso "viewMaestros").
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Proveedor eliminado.
 *         content:
 *           application/json:
 *             schema: { type: object, properties: { ok: { type: boolean } } }
 *       403:
 *         description: No autorizado.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: Proveedor no encontrado.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       409:
 *         description: El proveedor ya está en uso en registros existentes, no se puede eliminar.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
export async function DELETE(_request, { params }) {
  const { user, denied } = await requirePermission("editProveedores");
  if (denied) return denied;
  try {
    await deleteProveedor(params.id, user);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}

/**
 * @openapi
 * /api/proveedores/{id}:
 *   get:
 *     tags: [Proveedores]
 *     summary: Ficha del proveedor — datos, estado y checklist del ciclo vigente, alerta y histórico por ciclo (requiere permiso "viewProveedores").
 */
export async function GET(_request, { params }) {
  const { denied } = await requirePermission("viewProveedores");
  if (denied) return denied;
  try {
    return NextResponse.json(await getProveedorDetalle(params.id));
  } catch (err) {
    return apiError(err);
  }
}
