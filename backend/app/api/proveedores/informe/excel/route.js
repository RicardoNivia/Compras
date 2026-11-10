import { NextResponse } from "next/server";
import { requirePermission, apiError } from "@/lib/apiGuard";
import { informeExcelBuffer } from "@/lib/proveedoresInforme";

/**
 * @openapi
 * /api/proveedores/informe/excel:
 *   get:
 *     tags: [Proveedores]
 *     summary: Descarga el informe mensual de proveedores en Excel (.xlsx, varias hojas). Requiere permiso "viewProveedores".
 *     parameters:
 *       - { name: anio, in: query, schema: { type: integer } }
 *       - { name: mes, in: query, schema: { type: integer } }
 */
export async function GET(request) {
  const { denied } = await requirePermission("viewProveedores");
  if (denied) return denied;
  try {
    const sp = request.nextUrl.searchParams;
    const { buffer, nombre } = await informeExcelBuffer({ anio: sp.get("anio") ?? undefined, mes: sp.get("mes") ?? undefined });
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${nombre}"`,
      },
    });
  } catch (err) {
    return apiError(err);
  }
}
