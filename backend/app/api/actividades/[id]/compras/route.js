import { NextResponse } from "next/server";
import { logCompraDeActividad } from "@/lib/audit";
import { requirePermisoActividad, apiError } from "@/lib/apiGuard";
import { prisma } from "@/lib/prisma";
import { asignarActividadACompra } from "@/lib/records";

/**
 * @openapi
 * /api/actividades/{id}/compras:
 *   post:
 *     tags: [Bienestar]
 *     summary: Asocia una compra ({ recordId }) a la actividad. Requiere editBienestar (no hace falta poder editar la compra).
 *     responses:
 *       200: { description: "{ record }" }
 *       400: { description: La actividad no existe o está cerrada. }
 *   delete:
 *     tags: [Bienestar]
 *     summary: Quita la compra (?recordId=) de la actividad.
 *     responses:
 *       200: { description: "{ record }" }
 */
export async function POST(request, { params }) {
  const { user, denied } = await requirePermisoActividad(params.id, "editar");
  if (denied) return denied;
  try {
    const { recordId } = await request.json();
    const record = await asignarActividadACompra(recordId, params.id, user);
    logCompraDeActividad(user, { id: params.id, nombre: record.actividad, fecha: null }, `Asoció la compra #${record.localSeq ?? record.id}`).catch(() => {});
    return NextResponse.json({ record });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(request, { params }) {
  const { user, denied } = await requirePermisoActividad(params.id, "editar");
  if (denied) return denied;
  try {
    const recordId = new URL(request.url).searchParams.get("recordId");
    const actual = await prisma.record.findUnique({ where: { id: String(recordId) }, select: { actividadId: true } });
    if (!actual || actual.actividadId !== Number(params.id)) return NextResponse.json({ error: "Esa compra no está asociada a esta actividad." }, { status: 400 });
    const nombre = (await prisma.actividadBienestar.findUnique({ where: { id: Number(params.id) }, select: { nombre: true } }))?.nombre;
    const record = await asignarActividadACompra(recordId, null, user);
    logCompraDeActividad(user, { id: params.id, nombre, fecha: null }, `Quitó la compra #${record.localSeq ?? record.id}`).catch(() => {});
    return NextResponse.json({ record });
  } catch (err) {
    return apiError(err);
  }
}
