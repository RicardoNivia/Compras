import { NextResponse } from "next/server";
import { requirePermission, apiError } from "@/lib/apiGuard";
import { indicadoresExcelBuffer } from "@/lib/proveedoresInforme";

/**
 * @openapi
 * /api/proveedores/indicadores/excel:
 *   get:
 *     tags: [Proveedores]
 *     summary: Descarga los indicadores de proveedores en Excel (.xlsx, una hoja por bloque). Requiere permiso "viewProveedores".
 */
export async function GET() {
  const { denied } = await requirePermission("viewProveedores");
  if (denied) return denied;
  try {
    const { buffer, nombre } = await indicadoresExcelBuffer();
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
