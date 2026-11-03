import { NextResponse } from "next/server";
import { requireAlgunPermiso, apiError } from "@/lib/apiGuard";
import { listComprasSinActividad } from "@/lib/actividadesBienestar";

/**
 * @openapi
 * /api/actividades/compras-sin-actividad:
 *   get:
 *     tags: [Bienestar]
 *     summary: Compras del área Bienestar sin actividad asociada en un año (?anio) o mes (?mes), para verlas y asociarlas. Requiere ver Bienestar o Fundación.
 *     responses:
 *       200: { description: "{ compras }" }
 */
export async function GET(request) {
  const { denied } = await requireAlgunPermiso(["viewDashboardBienestar", "viewDashboardFundacion", "viewBienestar", "viewFundacion"]);
  if (denied) return denied;
  try {
    const sp = new URL(request.url).searchParams;
    return NextResponse.json({ compras: await listComprasSinActividad({ anio: sp.get("anio"), mes: sp.get("mes") }) });
  } catch (err) {
    return apiError(err);
  }
}
