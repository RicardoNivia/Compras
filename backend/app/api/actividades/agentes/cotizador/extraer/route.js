import { NextResponse } from "next/server";
import { requireAlgunPermiso, apiError } from "@/lib/apiGuard";
import { extraerCotizacion } from "@/lib/agenteCotizador";
import { MAX_BYTES_ARCHIVO } from "@/lib/archivoSeguro";
import { logCuadroComparativo } from "@/lib/audit";

/**
 * @openapi
 * /api/actividades/agentes/cotizador/extraer:
 *   post:
 *     tags: [Bienestar]
 *     summary: Revisa UNA cotización (PDF, Excel, CSV o foto; por su contenido, rechazando archivos peligrosos) y Nova extrae proveedor, ítems, totales y condiciones. No guarda nada. Requiere editar Bienestar o Fundación.
 *     responses:
 *       200: { description: "{ cotizacion }" }
 */
export async function POST(request) {
  const { user, denied } = await requireAlgunPermiso(["editBienestar", "editFundacion"]);
  if (denied) return denied;
  let nombre = "archivo";
  try {
    const form = await request.formData();
    const archivo = form.get("archivo");
    if (!archivo || typeof archivo === "string") return NextResponse.json({ error: "Adjunta la cotización." }, { status: 400 });
    nombre = archivo.name || nombre;
    if (archivo.size > MAX_BYTES_ARCHIVO) return NextResponse.json({ error: `No se acepta «${nombre}»: pasa de 10 MB.` }, { status: 400 });
    const buffer = Buffer.from(await archivo.arrayBuffer());
    return NextResponse.json({ cotizacion: await extraerCotizacion(buffer, nombre) });
  } catch (err) {
    // Un archivo rechazado por peligroso queda en la auditoría, igual que en el agente de importación.
    if (err.rechazado) logCuadroComparativo(user, { id: "archivo", titulo: nombre }, "rechazar", err.message).catch(() => {});
    return apiError(err);
  }
}
