import { NextResponse } from "next/server";
import { requirePermisoActividad, apiError } from "@/lib/apiGuard";
import { listInventario, crearItem, resumenInventario } from "@/lib/inventarioBienestar";

/**
 * @openapi
 * /api/actividades/{id}/inventario:
 *   get:
 *     tags: [Bienestar]
 *     summary: Inventario de la actividad (cantidad, usado, sobrante y su costo). Requiere viewBienestar.
 *     responses:
 *       200: { description: "{ items, resumen }" }
 *   post:
 *     tags: [Bienestar]
 *     summary: Agrega un ítem ({ item, unidad, cantidad, usado, costoUnitario }). Requiere editBienestar.
 *     responses:
 *       201: { description: Ítem creado. }
 */
export async function GET(_request, { params }) {
  const { denied } = await requirePermisoActividad(params.id, "ver");
  if (denied) return denied;
  try {
    const items = await listInventario(params.id);
    return NextResponse.json({ items, resumen: resumenInventario(items) });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(request, { params }) {
  const { user, denied } = await requirePermisoActividad(params.id, "editar");
  if (denied) return denied;
  try {
    return NextResponse.json(await crearItem(params.id, await request.json(), user), { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
