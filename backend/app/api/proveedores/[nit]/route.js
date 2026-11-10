import { NextResponse } from "next/server";
import { updateProveedor, deleteProveedor } from "@/lib/proveedores";
import { getProveedorDetalle } from "@/lib/proveedoresCiclo";
import { requirePermission, apiError } from "@/lib/apiGuard";

/**
 * @openapi
 * /api/proveedores/{nit}:
 *   patch:
 *     tags: [Proveedores]
 *     summary: Edita un proveedor por NIT (llave primaria) — datos, maestros (tipo, clasificación por monto, tipo de servicio, área) y excepción (requiere "editProveedores"). Si se envía un nit distinto, el cambio se propaga a registros, ciclos y calificaciones (ON UPDATE CASCADE).
 *     parameters:
 *       - { name: nit, in: path, required: true, schema: { type: string } }
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
 *               tipoProveedorId: { type: string }
 *               clasificacionMontoId: { type: string }
 *               tipoServicioId: { type: string }
 *               areaId: { type: string }
 *               esExcepcion: { type: boolean }
 *               motivoExcepcionId: { type: string }
 *               justificacionExcepcion: { type: string }
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
    const proveedor = await updateProveedor(params.nit, body, user);
    return NextResponse.json(proveedor);
  } catch (err) {
    return apiError(err);
  }
}

/**
 * @openapi
 * /api/proveedores/{nit}:
 *   delete:
 *     tags: [Proveedores]
 *     summary: Elimina un proveedor, si no está en uso en ningún registro (requiere permiso "viewMaestros").
 *     parameters:
 *       - { name: nit, in: path, required: true, schema: { type: string } }
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
    await deleteProveedor(params.nit, user);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}

/**
 * @openapi
 * /api/proveedores/{nit}:
 *   get:
 *     tags: [Proveedores]
 *     summary: Ficha del proveedor — datos, estado y checklist del ciclo vigente, alerta y histórico por ciclo (requiere permiso "viewProveedores").
 */
export async function GET(_request, { params }) {
  const { denied } = await requirePermission("viewProveedores");
  if (denied) return denied;
  try {
    return NextResponse.json(await getProveedorDetalle(params.nit));
  } catch (err) {
    return apiError(err);
  }
}
