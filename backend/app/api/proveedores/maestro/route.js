import { NextResponse } from "next/server";
import { requirePermission, apiError } from "@/lib/apiGuard";
import { listMaestroProveedores } from "@/lib/proveedoresCiclo";

/**
 * @openapi
 * /api/proveedores/maestro:
 *   get:
 *     tags: [Proveedores]
 *     summary: Maestro general de proveedores del ciclo vigente, con filtros combinables (requiere permiso "viewProveedores").
 *     parameters:
 *       - { name: q, in: query, schema: { type: string }, description: Nombre o NIT }
 *       - { name: clasificacion, in: query, schema: { type: string }, description: "actualizacion | nuevo | excepcion | inactivo (se puede repetir)" }
 *       - { name: estado, in: query, schema: { type: string }, description: "desactualizado | en_proceso | en_aprobacion | actualizado (se puede repetir)" }
 *       - { name: checklist, in: query, schema: { type: string }, description: "completo | incompleto" }
 *       - { name: criticidad, in: query, schema: { type: string } }
 *       - { name: areaId, in: query, schema: { type: string } }
 *       - { name: registradoDesde, in: query, schema: { type: string }, description: "Fecha de registro desde (aaaa-mm-dd), incluida" }
 *       - { name: registradoHasta, in: query, schema: { type: string }, description: "Fecha de registro hasta (aaaa-mm-dd), incluida" }
 *     responses:
 *       200: { description: Filas filtradas, conteos por clasificación y estado, y año del ciclo }
 */
export async function GET(request) {
  const { denied } = await requirePermission("viewProveedores");
  if (denied) return denied;
  try {
    const sp = request.nextUrl.searchParams;
    const data = await listMaestroProveedores({
      q: sp.get("q") || "",
      clasificacion: sp.getAll("clasificacion"),
      estado: sp.getAll("estado"),
      checklist: sp.get("checklist") || "",
      criticidad: sp.get("criticidad") || "",
      areaId: sp.get("areaId") || "",
      tipoProveedorId: sp.get("tipoProveedorId") || "",
      clasificacionMontoId: sp.get("clasificacionMontoId") || "",
      tipoServicioId: sp.get("tipoServicioId") || "",
      excepcion: sp.get("excepcion") || "",
      registradoDesde: sp.get("registradoDesde") || "",
      registradoHasta: sp.get("registradoHasta") || "",
    });
    return NextResponse.json(data);
  } catch (err) {
    return apiError(err);
  }
}
