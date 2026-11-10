import { NextResponse } from "next/server";
import { requirePermisoActividad, apiError } from "@/lib/apiGuard";
import { configurarFormulario, PLANTILLAS_FORMULARIO } from "@/lib/participantesBienestar";

/**
 * @openapi
 * /api/actividades/{id}/formulario:
 *   get:
 *     tags: [Bienestar]
 *     summary: Plantillas disponibles para el formulario público de inscripción. Requiere viewBienestar.
 *     responses:
 *       200: { description: "{ plantillas }" }
 *   put:
 *     tags: [Bienestar]
 *     summary: Configura el formulario público ({ abierto, plantilla | campos, nuevoEnlace }); genera el enlace la primera vez. Requiere editBienestar.
 *     responses:
 *       200: { description: "{ formularioToken, formularioAbierto, formularioCampos }" }
 */
export async function GET(_request, { params }) {
  const { denied } = await requirePermisoActividad(params.id, "ver");
  if (denied) return denied;
  return NextResponse.json({ plantillas: Object.entries(PLANTILLAS_FORMULARIO).map(([clave, p]) => ({ clave, ...p })) });
}

export async function PUT(request, { params }) {
  const { user, denied } = await requirePermisoActividad(params.id, "editar");
  if (denied) return denied;
  try {
    return NextResponse.json(await configurarFormulario(params.id, await request.json(), user));
  } catch (err) {
    return apiError(err);
  }
}
