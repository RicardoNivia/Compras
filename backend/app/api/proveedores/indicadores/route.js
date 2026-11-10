import { NextResponse } from "next/server";
import { requirePermission, apiError } from "@/lib/apiGuard";
import { indicadoresCiclo } from "@/lib/proveedoresCiclo";

/**
 * @openapi
 * /api/proveedores/indicadores:
 *   get:
 *     tags: [Proveedores]
 *     summary: Indicadores del ciclo vigente — mapa por estado, avance por área, críticos pendientes y proyección del siguiente ciclo (requiere permiso "viewProveedores").
 *     responses:
 *       200: { description: Indicadores }
 */
export async function GET() {
  const { denied } = await requirePermission("viewProveedores");
  if (denied) return denied;
  try {
    return NextResponse.json(await indicadoresCiclo());
  } catch (err) {
    return apiError(err);
  }
}
