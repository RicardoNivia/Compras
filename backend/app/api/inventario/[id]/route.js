import { NextResponse } from "next/server";
import { requireAlgunPermiso, apiError } from "@/lib/apiGuard";
import { editarArticulo } from "@/lib/inventarioBodega";

/**
 * @openapi
 * /api/inventario/{id}:
 *   patch:
 *     tags: [Bienestar]
 *     summary: Edita un artículo (producto, bodega, unidad, referencia, minimo, vence, activo). El stock no se edita aquí, solo con movimientos. Editar Bienestar o Fundación.
 */
export async function PATCH(request, { params }) {
  const { user, denied } = await requireAlgunPermiso(["editBienestar", "editFundacion"]);
  if (denied) return denied;
  try {
    return NextResponse.json({ articulo: await editarArticulo(params.id, await request.json(), user) });
  } catch (err) {
    return apiError(err);
  }
}
