import { NextResponse } from "next/server";
import { requirePermission, apiError } from "@/lib/apiGuard";
import { historialComprasProveedor } from "@/lib/valoraciones";

/**
 * @openapi
 * /api/proveedores/{nit}/compras:
 *   get:
 *     tags: [Proveedores]
 *     summary: Historial de compras de un proveedor con la valoración IA de cada una y su calificación general (requiere permiso "viewProveedores").
 *     parameters:
 *       - { name: nit, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: "{ proveedor, general: { promedioProveedor, promedioCompras, comprasValoradas, comprasTotales, radicadasSinValorar, distribucion }, compras: [...] }" }
 *       404: { description: Proveedor no encontrado. }
 */
export async function GET(_request, { params }) {
  const { denied } = await requirePermission("viewProveedores");
  if (denied) return denied;
  try {
    return NextResponse.json(await historialComprasProveedor(params.nit));
  } catch (err) {
    return apiError(err);
  }
}
