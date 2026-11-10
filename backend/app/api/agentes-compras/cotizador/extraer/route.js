import { NextResponse } from "next/server";
import { requirePermission, apiError } from "@/lib/apiGuard";
import { extraerCotizacion } from "@/lib/agenteCotizador";
import { MAX_BYTES_ARCHIVO } from "@/lib/archivoSeguro";
import { logCuadroComparativo } from "@/lib/audit";

/**
 * @openapi
 * /api/agentes-compras/cotizador/extraer:
 *   post:
 *     tags: [Agentes de Compras]
 *     summary: "Lee UNA cotización (multipart: archivo PDF, Excel, CSV o foto) con Nova. Los archivos peligrosos se rechazan y quedan auditados."
 *     responses:
 *       200: { description: "{ cotizacion }" }
 */
export async function POST(request) {
  const { user, denied } = await requirePermission("viewAgentesCompras");
  if (denied) return denied;
  let nombre = "archivo";
  try {
    const archivo = (await request.formData()).get("archivo");
    if (!archivo || typeof archivo === "string") return NextResponse.json({ error: "Adjunta la cotización." }, { status: 400 });
    nombre = archivo.name || nombre;
    if (archivo.size > MAX_BYTES_ARCHIVO) return NextResponse.json({ error: `No se acepta «${nombre}»: pasa de 10 MB.` }, { status: 400 });
    return NextResponse.json({ cotizacion: await extraerCotizacion(Buffer.from(await archivo.arrayBuffer()), nombre) });
  } catch (err) {
    if (err.rechazado) logCuadroComparativo(user, { id: "archivo", titulo: nombre }, "rechazar", err.message).catch(() => {});
    return apiError(err);
  }
}
