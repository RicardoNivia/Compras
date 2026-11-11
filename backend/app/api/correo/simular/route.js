import { NextResponse } from "next/server";
import { requirePermission, apiError } from "@/lib/apiGuard";
import { simularCorreo } from "@/lib/agenteCorreoProveedores";
import { MAX_BYTES_ARCHIVO } from "@/lib/archivoSeguro";

/**
 * @openapi
 * /api/correo/simular:
 *   post:
 *     tags: [Mi correo]
 *     summary: "Solo con CORREO_MODO=simulado (multipart: asunto, remitente, cuerpo, adjunto opcional PDF/foto): procesa el correo como si hubiera llegado al buzón."
 */
export async function POST(request) {
  const { user, denied } = await requirePermission("vincularCorreo");
  if (denied) return denied;
  try {
    const form = await request.formData();
    const archivo = form.get("adjunto");
    let adjunto = null;
    if (archivo && typeof archivo !== "string" && archivo.size) {
      if (archivo.size > MAX_BYTES_ARCHIVO) return NextResponse.json({ error: `No se acepta «${archivo.name}»: pasa de 10 MB.` }, { status: 400 });
      adjunto = { nombre: archivo.name || "adjunto", buffer: Buffer.from(await archivo.arrayBuffer()) };
    }
    return NextResponse.json(await simularCorreo(user, {
      asunto: String(form.get("asunto") || ""),
      remitente: String(form.get("remitente") || ""),
      cuerpo: String(form.get("cuerpo") || ""),
      adjunto,
    }));
  } catch (err) {
    return apiError(err);
  }
}
