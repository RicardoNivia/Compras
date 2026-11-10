import { NextResponse } from "next/server";
import { requirePermission, apiError } from "@/lib/apiGuard";
import { vigiaPresupuesto } from "@/lib/agentesCompras";

/**
 * @openapi
 * /api/agentes-compras/presupuesto:
 *   get:
 *     tags: [Agentes de Compras]
 *     summary: "Vigía de presupuesto (?anio=): por área (y categoría), gastado, ritmo mensual, proyección al cierre y mes en que se agotaría al ritmo actual. Requiere ver Presupuesto."
 *     responses:
 *       200: { description: "{ anio, mesesTranscurridos, total, gastado, areas, areasSinPresupuesto }" }
 */
export async function GET(request) {
  const { denied } = await requirePermission("viewPresupuesto");
  if (denied) return denied;
  try {
    return NextResponse.json(await vigiaPresupuesto(new URL(request.url).searchParams.get("anio")));
  } catch (err) {
    return apiError(err);
  }
}
