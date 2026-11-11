import { NextResponse } from "next/server";
import { requireAlgunPermiso, apiError } from "@/lib/apiGuard";
import { entradasDeCompra, entradaPorCompra } from "@/lib/inventarioBodega";

/**
 * @openapi
 * /api/records/{id}/inventario:
 *   get:
 *     tags: [Registros]
 *     summary: Lo que entró a la bodega de Bienestar con esta compra.
 *   post:
 *     tags: [Registros]
 *     summary: Registra que con esta compra llegaron artículos a la bodega ({ articuloId, cantidad }): suma al stock como entrada enlazada a la compra. Crear o editar compras.
 */
export async function GET(_request, { params }) {
  const { denied } = await requireAlgunPermiso(["createRecord", "editRecord", "viewBienestar", "viewFundacion"]);
  if (denied) return denied;
  try {
    return NextResponse.json({ entradas: await entradasDeCompra(params.id) });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(request, { params }) {
  const { user, denied } = await requireAlgunPermiso(["createRecord", "editRecord"]);
  if (denied) return denied;
  try {
    return NextResponse.json(await entradaPorCompra(params.id, await request.json(), user), { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
