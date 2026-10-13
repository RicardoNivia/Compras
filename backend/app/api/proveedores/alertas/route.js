import { NextResponse } from "next/server";
import { requirePermission, apiError } from "@/lib/apiGuard";
import { alertasPorProveedor } from "@/lib/proveedoresCiclo";

/**
 * @openapi
 * /api/proveedores/alertas:
 *   get:
 *     tags: [Proveedores]
 *     summary: Alerta del ciclo vigente por proveedor (solo los que no están al día). Lo usa la tabla de Registros para mostrar el ícono junto al proveedor.
 *     responses:
 *       200: { description: "Objeto NIT → { nivel, titulo }" }
 */
export async function GET() {
  const { denied } = await requirePermission("viewProveedores");
  if (denied) return denied;
  try {
    return NextResponse.json(await alertasPorProveedor());
  } catch (err) {
    return apiError(err);
  }
}
