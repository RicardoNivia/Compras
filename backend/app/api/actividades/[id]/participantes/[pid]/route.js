import { NextResponse } from "next/server";
import { requirePermisoActividad, apiError } from "@/lib/apiGuard";
import { actualizarParticipante, eliminarParticipante } from "@/lib/participantesBienestar";

/**
 * @openapi
 * /api/actividades/{id}/participantes/{pid}:
 *   put:
 *     tags: [Bienestar]
 *     summary: Cambia la asistencia, el motivo de inasistencia, la calificación u otros datos de un participante. Requiere editBienestar.
 *     responses:
 *       200: { description: "{ participante }" }
 *   delete:
 *     tags: [Bienestar]
 *     summary: Quita a la persona de la actividad. Requiere editBienestar.
 *     responses:
 *       200: { description: "{ ok: true }" }
 */
export async function PUT(request, { params }) {
  const { user, denied } = await requirePermisoActividad(params.id, "editar");
  if (denied) return denied;
  try {
    return NextResponse.json({ participante: await actualizarParticipante(params.id, params.pid, await request.json(), user) });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(_request, { params }) {
  const { user, denied } = await requirePermisoActividad(params.id, "editar");
  if (denied) return denied;
  try {
    await eliminarParticipante(params.id, params.pid, user);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
