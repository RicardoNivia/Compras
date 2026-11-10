import { NextResponse } from "next/server";
import { requirePermisoActividad, apiError } from "@/lib/apiGuard";
import { listFotos, crearFoto } from "@/lib/fotosBienestar";

/**
 * @openapi
 * /api/actividades/{id}/fotos:
 *   get:
 *     tags: [Bienestar]
 *     summary: Material fotográfico de la actividad (sin los bytes; cada imagen se pide en /fotos/{fid}). Requiere viewBienestar.
 *     responses:
 *       200: { description: "{ fotos }" }
 *   post:
 *     tags: [Bienestar]
 *     summary: Sube una foto ya reducida (multipart con imagen, miniatura, nombre, descripcion, ancho, alto). Solo JPG/PNG/WebP. Requiere editBienestar.
 *     responses:
 *       201: { description: Foto creada. }
 *       409: { description: Esa foto ya está en la actividad. }
 */
export async function GET(_request, { params }) {
  const { denied } = await requirePermisoActividad(params.id, "ver");
  if (denied) return denied;
  try {
    return NextResponse.json({ fotos: await listFotos(params.id) });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(request, { params }) {
  const { user, denied } = await requirePermisoActividad(params.id, "editar");
  if (denied) return denied;
  try {
    const form = await request.formData();
    const imagen = form.get("imagen");
    const miniatura = form.get("miniatura");
    if (!imagen || typeof imagen === "string" || !miniatura || typeof miniatura === "string") {
      return NextResponse.json({ error: "Adjunta la foto." }, { status: 400 });
    }
    const foto = await crearFoto(params.id, {
      imagen: Buffer.from(await imagen.arrayBuffer()),
      miniatura: Buffer.from(await miniatura.arrayBuffer()),
      nombre: form.get("nombre"),
      descripcion: form.get("descripcion"),
      ancho: form.get("ancho"),
      alto: form.get("alto"),
    }, user);
    return NextResponse.json(foto, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
