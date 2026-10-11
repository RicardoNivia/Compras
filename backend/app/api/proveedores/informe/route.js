import { NextResponse } from "next/server";
import { requirePermission, apiError } from "@/lib/apiGuard";
import { informeMensual } from "@/lib/proveedoresInforme";

/**
 * @openapi
 * /api/proveedores/informe:
 *   get:
 *     tags: [Proveedores]
 *     summary: Informe mensual de proveedores — nuevos, actualizados y cambios hechos en la app durante un mes (requiere permiso "viewProveedores").
 *     parameters:
 *       - { name: anio, in: query, schema: { type: integer }, description: "Por defecto el año en curso" }
 *       - { name: mes, in: query, schema: { type: integer, minimum: 1, maximum: 12 }, description: "Por defecto el mes en curso" }
 *     responses:
 *       200: { description: KPIs, tendencia de 6 meses, movimiento por área y listas de nuevos y actualizados del mes }
 *       400: { description: Año o mes inválido }
 */
export async function GET(request) {
  const { denied } = await requirePermission("viewProveedores");
  if (denied) return denied;
  try {
    const sp = request.nextUrl.searchParams;
    return NextResponse.json(await informeMensual({ anio: sp.get("anio") ?? undefined, mes: sp.get("mes") ?? undefined }));
  } catch (err) {
    return apiError(err);
  }
}
