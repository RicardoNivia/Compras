import { NextResponse } from "next/server";
import { requirePermisoActividad, apiError } from "@/lib/apiGuard";
import { listParticipantes, crearParticipante } from "@/lib/participantesBienestar";
import { motivosActivos, valoresActivos } from "@/lib/catalogosBienestar";

/**
 * @openapi
 * /api/actividades/{id}/participantes:
 *   get:
 *     tags: [Bienestar]
 *     summary: Inscritos de la actividad con su asistencia, motivo, calificación y campos propios (los sensibles solo con editBienestar). Requiere viewBienestar.
 *     responses:
 *       200: { description: "{ participantes, motivos }" }
 *   post:
 *     tags: [Bienestar]
 *     summary: Agrega una persona a mano ({ nombre, documento, area, asistio, motivoInasistencia }). Requiere editBienestar.
 *     responses:
 *       201: { description: Participante creado. }
 *       409: { description: Esa persona ya está en la actividad. }
 */
export async function GET(_request, { params }) {
  const { user, denied } = await requirePermisoActividad(params.id, "ver");
  if (denied) return denied;
  try {
    return NextResponse.json({ participantes: await listParticipantes(params.id, user), motivos: await motivosActivos(), areas: await valoresActivos("areaParticipante") });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(request, { params }) {
  const { user, denied } = await requirePermisoActividad(params.id, "editar");
  if (denied) return denied;
  try {
    return NextResponse.json(await crearParticipante(params.id, await request.json(), user), { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
