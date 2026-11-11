import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermisoActividad, requireAlgunPermiso, apiError } from "@/lib/apiGuard";
import { actualizarItem, eliminarItem } from "@/lib/inventarioBienestar";

/**
 * @openapi
 * /api/actividades/{id}/inventario/{iid}:
 *   put:
 *     tags: [Bienestar]
 *     summary: Cambia un ítem (por ejemplo, cuánto se usó). Requiere editBienestar.
 *     responses:
 *       200: { description: "{ item }" }
 *   delete:
 *     tags: [Bienestar]
 *     summary: Quita un ítem del inventario. Requiere editBienestar.
 *     responses:
 *       200: { description: "{ ok: true }" }
 */
export async function PUT(request, { params }) {
  const { user, denied } = await requirePermisoActividad(params.id, "editar");
  if (denied) return denied;
  try {
    return NextResponse.json({ item: await actualizarItem(params.id, params.iid, await request.json(), user) });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(_request, { params }) {
  const { user, denied } = await requirePermisoActividad(params.id, "editar");
  if (denied) return denied;
  try {
    // Quitar lo que vino de la bodega la devuelve al stock: pide además el permiso de usar la bodega.
    const fila = await prisma.inventarioActividad.findFirst({ where: { id: Number(params.iid) || 0, actividadId: Number(params.id) || 0 }, select: { articuloId: true } });
    if (fila?.articuloId) {
      const bodega = await requireAlgunPermiso(["usarInventarioBienestar"]);
      if (bodega.denied) return bodega.denied;
    }
    await eliminarItem(params.id, params.iid, user);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
