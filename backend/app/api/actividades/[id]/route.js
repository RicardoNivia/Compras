import { NextResponse } from "next/server";
import { requirePermisoActividad, featureDeLinea, apiError } from "@/lib/apiGuard";
import { isRoleAllowed } from "@/lib/permissions";
import { getActividad, updateActividad, deleteActividad } from "@/lib/actividadesBienestar";

/**
 * @openapi
 * /api/actividades/{id}:
 *   get:
 *     tags: [Bienestar]
 *     summary: Detalle de una actividad con sus compras asociadas (número, descripción, proveedor, valor, legalización). Requiere viewBienestar.
 *     responses:
 *       200: { description: "{ actividad }" }
 *       404: { description: Actividad no encontrada. }
 *   put:
 *     tags: [Bienestar]
 *     summary: Edita una actividad (solo los campos enviados). Requiere editBienestar.
 *     responses:
 *       200: { description: "{ actividad }" }
 *   delete:
 *     tags: [Bienestar]
 *     summary: Elimina una actividad sin compras asociadas (con compras responde 409). Requiere editBienestar.
 *     responses:
 *       200: { description: "{ ok: true }" }
 *       409: { description: Tiene compras asociadas. }
 */
export async function GET(_request, { params }) {
  const { denied } = await requirePermisoActividad(params.id, "ver");
  if (denied) return denied;
  try {
    return NextResponse.json({ actividad: await getActividad(params.id) });
  } catch (err) {
    return apiError(err);
  }
}

export async function PUT(request, { params }) {
  const { user, denied } = await requirePermisoActividad(params.id, "editar");
  if (denied) return denied;
  try {
    const body = await request.json();
    // Pasarla a la otra línea exige también poder editar esa línea.
    if (body.linea && !(await isRoleAllowed(user.role, featureDeLinea("editar", body.linea)))) {
      return NextResponse.json({ error: `No tienes permiso para editar actividades de ${body.linea}.` }, { status: 403 });
    }
    return NextResponse.json({ actividad: await updateActividad(params.id, body, user) });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(_request, { params }) {
  const { user, denied } = await requirePermisoActividad(params.id, "editar");
  if (denied) return denied;
  try {
    await deleteActividad(params.id, user);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
