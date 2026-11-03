import { NextResponse } from "next/server";
import { requirePermisoActividad, apiError } from "@/lib/apiGuard";
import { importarParticipantes } from "@/lib/participantesBienestar";

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * @openapi
 * /api/actividades/{id}/participantes/importar:
 *   post:
 *     tags: [Bienestar]
 *     summary: Importa un Excel (exportación de Microsoft Forms o lista de asistencia). multipart con archivo, modo (inscripcion|asistencia), hoja (opcional) y noMarcadosNoAsistieron. Requiere editBienestar.
 *     responses:
 *       200: { description: "{ leidos, creados, actualizados, sinCoincidencia, marcadosNo, hoja, columnas }" }
 */
export async function POST(request, { params }) {
  const { user, denied } = await requirePermisoActividad(params.id, "editar");
  if (denied) return denied;
  try {
    const form = await request.formData();
    const archivo = form.get("archivo");
    if (!archivo || typeof archivo === "string") return NextResponse.json({ error: "Adjunta el archivo de Excel." }, { status: 400 });
    if (archivo.size > MAX_BYTES) return NextResponse.json({ error: "El archivo pasa de 5 MB." }, { status: 400 });
    const buffer = Buffer.from(await archivo.arrayBuffer());
    return NextResponse.json(await importarParticipantes(params.id, buffer, {
      modo: form.get("modo") === "asistencia" ? "asistencia" : "inscripcion",
      hoja: form.get("hoja") || undefined,
      noMarcadosNoAsistieron: form.get("noMarcadosNoAsistieron") === "1",
    }, user));
  } catch (err) {
    return apiError(err);
  }
}
