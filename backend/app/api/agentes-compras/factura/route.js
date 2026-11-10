import { NextResponse } from "next/server";
import { requireAlgunPermiso, apiError } from "@/lib/apiGuard";
import { verificarFactura } from "@/lib/agentesCompras";
import { MAX_BYTES_ARCHIVO } from "@/lib/archivoSeguro";
import { logVerificacionFactura } from "@/lib/audit";

/**
 * @openapi
 * /api/agentes-compras/factura:
 *   post:
 *     tags: [Agentes de Compras]
 *     summary: "Verificador de factura (multipart: recordId + archivo PDF o foto). Nova lee la factura y el sistema la compara con el registro (NIT, proveedor, valores, FE, fecha, a nombre de quién). No cambia el registro; queda auditado en la compra."
 *     responses:
 *       200: { description: "{ compra, factura, checks, veredicto }" }
 */
export async function POST(request) {
  const { user, denied } = await requireAlgunPermiso(["viewAgentesCompras"]);
  if (denied) return denied;
  let nombre = "archivo";
  let recordId = null;
  try {
    const form = await request.formData();
    recordId = form.get("recordId");
    const archivo = form.get("archivo");
    if (!recordId) return NextResponse.json({ error: "Elige la compra que vas a verificar." }, { status: 400 });
    if (!archivo || typeof archivo === "string") return NextResponse.json({ error: "Adjunta la factura." }, { status: 400 });
    nombre = archivo.name || nombre;
    if (archivo.size > MAX_BYTES_ARCHIVO) return NextResponse.json({ error: `No se acepta «${nombre}»: pasa de 10 MB.` }, { status: 400 });
    return NextResponse.json(await verificarFactura(String(recordId), Buffer.from(await archivo.arrayBuffer()), nombre, user));
  } catch (err) {
    if (err.rechazado && recordId) logVerificacionFactura(user, { id: recordId, localSeq: null }, err.message).catch(() => {});
    return apiError(err);
  }
}
