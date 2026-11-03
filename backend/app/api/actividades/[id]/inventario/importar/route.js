import { NextResponse } from "next/server";
import { requirePermisoActividad, apiError } from "@/lib/apiGuard";
import { importarInventario } from "@/lib/inventarioBienestar";

/**
 * @openapi
 * /api/actividades/{id}/inventario/importar:
 *   post:
 *     tags: [Bienestar]
 *     summary: Sube el inventario desde un Excel (Ítem, Cantidad, Unidad, Costo unitario, Usado). multipart con archivo. Requiere editBienestar.
 *     responses:
 *       200: { description: "{ creados, actualizados, items }" }
 */
export async function POST(request, { params }) {
  const { user, denied } = await requirePermisoActividad(params.id, "editar");
  if (denied) return denied;
  try {
    const form = await request.formData();
    const archivo = form.get("archivo");
    if (!archivo || typeof archivo === "string") return NextResponse.json({ error: "Adjunta el archivo de Excel." }, { status: 400 });
    if (archivo.size > 5 * 1024 * 1024) return NextResponse.json({ error: "El archivo pasa de 5 MB." }, { status: 400 });
    return NextResponse.json(await importarInventario(params.id, Buffer.from(await archivo.arrayBuffer()), user));
  } catch (err) {
    return apiError(err);
  }
}
