import { NextResponse } from "next/server";
import { requireAlgunPermiso, apiError } from "@/lib/apiGuard";
import { comprasSinActividad } from "@/lib/records";

/**
 * @openapi
 * /api/actividades/compras-disponibles:
 *   get:
 *     tags: [Bienestar]
 *     summary: Compras sin actividad para asociarlas (?q= número, descripción, proveedor o área). Requiere editBienestar.
 *     responses:
 *       200: { description: "{ compras: [...] }" }
 */
export async function GET(request) {
  const { denied } = await requireAlgunPermiso(["editBienestar", "editFundacion"]);
  if (denied) return denied;
  try {
    const q = new URL(request.url).searchParams.get("q") || "";
    return NextResponse.json({ compras: await comprasSinActividad({ q, limite: 300 }) });
  } catch (err) {
    return apiError(err);
  }
}
