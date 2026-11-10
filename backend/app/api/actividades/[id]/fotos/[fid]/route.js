import { NextResponse } from "next/server";
import { requirePermisoActividad, apiError } from "@/lib/apiGuard";
import { imagenDeFoto, actualizarFoto, eliminarFoto } from "@/lib/fotosBienestar";

/**
 * @openapi
 * /api/actividades/{id}/fotos/{fid}:
 *   get:
 *     tags: [Bienestar]
 *     summary: La imagen (?t=mini para la miniatura). Requiere viewBienestar.
 *     responses:
 *       200: { description: La imagen. }
 *   put:
 *     tags: [Bienestar]
 *     summary: Cambia la descripción de la foto. Requiere editBienestar.
 *     responses:
 *       200: { description: "{ foto }" }
 *   delete:
 *     tags: [Bienestar]
 *     summary: Quita la foto de la actividad. Requiere editBienestar.
 *     responses:
 *       200: { description: "{ ok: true }" }
 */
export async function GET(request, { params }) {
  const { denied } = await requirePermisoActividad(params.id, "ver");
  if (denied) return denied;
  try {
    const miniatura = new URL(request.url).searchParams.get("t") === "mini";
    const { buffer, mime } = await imagenDeFoto(params.id, params.fid, { miniatura });
    return new NextResponse(buffer, {
      headers: { "Content-Type": mime, "Content-Length": String(buffer.length), "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" },
    });
  } catch (err) {
    return apiError(err);
  }
}

export async function PUT(request, { params }) {
  const { user, denied } = await requirePermisoActividad(params.id, "editar");
  if (denied) return denied;
  try {
    return NextResponse.json({ foto: await actualizarFoto(params.id, params.fid, await request.json(), user) });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(_request, { params }) {
  const { user, denied } = await requirePermisoActividad(params.id, "editar");
  if (denied) return denied;
  try {
    await eliminarFoto(params.id, params.fid, user);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
