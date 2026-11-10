import { NextResponse } from "next/server";
import { requirePermisoActividad, apiError } from "@/lib/apiGuard";
import { analizarArchivo, importarArchivo } from "@/lib/agenteImportacion";
import { MAX_BYTES_ARCHIVO } from "@/lib/archivoSeguro";

/**
 * @openapi
 * /api/actividades/{id}/agente-importacion:
 *   post:
 *     tags: [Bienestar]
 *     summary: Agente de importación. multipart con archivo (Excel o CSV), accion (analizar | importar) y plan (JSON, opcional; el que devolvió analizar, con las respuestas). Analizar no escribe nada; importar aplica el plan sin volver a llamar a Nova. Requiere editar la línea.
 *     responses:
 *       200: { description: "analizar → { tipo, seguro, mapeo, explicacion, advertencias, preguntas, vistaPrevia }; importar → { tipo, resultado }" }
 */
export async function POST(request, { params }) {
  const { user, denied } = await requirePermisoActividad(params.id, "editar");
  if (denied) return denied;
  try {
    const form = await request.formData();
    const archivo = form.get("archivo");
    if (!archivo || typeof archivo === "string") return NextResponse.json({ error: "Adjunta el archivo." }, { status: 400 });
    if (archivo.size > MAX_BYTES_ARCHIVO) return NextResponse.json({ error: `«${archivo.name}» pasa de 10 MB.` }, { status: 400 });
    let plan = null;
    if (form.get("plan")) {
      try {
        plan = JSON.parse(form.get("plan"));
      } catch {
        return NextResponse.json({ error: "El plan de importación no es válido. Vuelve a subir el archivo." }, { status: 400 });
      }
    }
    const buffer = Buffer.from(await archivo.arrayBuffer());
    const nombre = String(archivo.name || "archivo").slice(0, 200);
    if (form.get("accion") === "importar") return NextResponse.json(await importarArchivo(params.id, buffer, nombre, plan || {}, user));
    return NextResponse.json(await analizarArchivo(params.id, buffer, nombre, plan, user));
  } catch (err) {
    return apiError(err);
  }
}
