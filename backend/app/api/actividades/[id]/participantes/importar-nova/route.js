import { NextResponse } from "next/server";
import { requirePermisoActividad, apiError } from "@/lib/apiGuard";
import { importarConNova } from "@/lib/importacionNova";

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * @openapi
 * /api/actividades/{id}/participantes/importar-nova:
 *   post:
 *     tags: [Bienestar]
 *     summary: Importa un Excel de programados, asistentes o calificaciones; Nova identifica las columnas. multipart con archivo, tipo (programados|asistentes|calificaciones), noMarcadosNoAsistieron, y al confirmar confirmar=1 + mapeo (JSON de la vista previa). Sin confirmar no escribe nada. Requiere editBienestar.
 *     responses:
 *       200: { description: "{ tipo, hoja, mapeo, columnas, muestra, descartadas, resultado, confirmado }" }
 */
export async function POST(request, { params }) {
  const { user, denied } = await requirePermisoActividad(params.id, "editar");
  if (denied) return denied;
  try {
    const form = await request.formData();
    const archivo = form.get("archivo");
    if (!archivo || typeof archivo === "string") return NextResponse.json({ error: "Adjunta el archivo de Excel." }, { status: 400 });
    if (archivo.size > MAX_BYTES) return NextResponse.json({ error: "El archivo pasa de 5 MB." }, { status: 400 });
    let mapeo = null;
    if (form.get("mapeo")) {
      try {
        mapeo = JSON.parse(form.get("mapeo"));
      } catch {
        return NextResponse.json({ error: "El mapeo del archivo no es válido. Vuelve a elegir el archivo." }, { status: 400 });
      }
    }
    return NextResponse.json(await importarConNova(params.id, Buffer.from(await archivo.arrayBuffer()), {
      tipo: form.get("tipo"),
      mapeo,
      confirmar: form.get("confirmar") === "1",
      noMarcadosNoAsistieron: form.get("noMarcadosNoAsistieron") === "1",
    }, user));
  } catch (err) {
    return apiError(err);
  }
}
