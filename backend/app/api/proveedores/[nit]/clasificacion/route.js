import { NextResponse } from "next/server";
import { requirePermission, apiError } from "@/lib/apiGuard";
import { cambiarClasificacion } from "@/lib/proveedoresCiclo";

/**
 * @openapi
 * /api/proveedores/{nit}/clasificacion:
 *   patch:
 *     tags: [Proveedores]
 *     summary: Marca o quita excepción, o inactiva o reactiva al proveedor (requiere permiso "editProveedores"). Nunca borra el histórico de ciclos.
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [accion]
 *             properties:
 *               accion: { type: string, enum: [excepcion, quitar-excepcion, inactivar, reactivar] }
 *               motivoExcepcionId: { type: string }
 *               justificacion: { type: string }
 *               inactivoMotivo: { type: string }
 */
export async function PATCH(request, { params }) {
  const { user, denied } = await requirePermission("editProveedores");
  if (denied) return denied;
  try {
    const body = await request.json().catch(() => ({}));
    return NextResponse.json(await cambiarClasificacion(params.nit, body, user));
  } catch (err) {
    return apiError(err);
  }
}
