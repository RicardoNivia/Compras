import { NextResponse } from "next/server";
import { requireAlgunPermiso, apiError } from "@/lib/apiGuard";
import { listArticulos, crearArticulo } from "@/lib/inventarioBodega";

/**
 * @openapi
 * /api/inventario:
 *   get:
 *     tags: [Bienestar]
 *     summary: Artículos de la bodega de Bienestar con su stock, mínimo, vencimiento y totales de entradas y salidas. Ver Bienestar, ver Fundación o crear/editar compras.
 *     responses:
 *       200: { description: "{ articulos: [...] }" }
 *   post:
 *     tags: [Bienestar]
 *     summary: Crea un artículo (producto, bodega bodega|sst|aseo, unidad, referencia, minimo, vence). Queda con stock 0. Editar Bienestar o Fundación.
 */
export async function GET(request) {
  const { denied } = await requireAlgunPermiso(["viewBienestar", "viewFundacion", "createRecord", "editRecord"]);
  if (denied) return denied;
  try {
    const soloActivos = new URL(request.url).searchParams.get("activos") === "1";
    return NextResponse.json({ articulos: await listArticulos({ soloActivos }) });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(request) {
  const { user, denied } = await requireAlgunPermiso(["editBienestar", "editFundacion"]);
  if (denied) return denied;
  try {
    return NextResponse.json({ articulo: await crearArticulo(await request.json(), user) }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
