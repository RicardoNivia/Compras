import { NextResponse } from "next/server";
import { requirePermission, apiError } from "@/lib/apiGuard";
import { detectarAnomalias } from "@/lib/agentesCompras";

/**
 * @openapi
 * /api/agentes-compras/anomalias:
 *   get:
 *     tags: [Agentes de Compras]
 *     summary: "Detector de anomalías (?desde=&hasta=, por defecto los últimos 12 meses): compras posiblemente partidas, posibles duplicados, precios muy por encima del historial y gasto concentrado en un proveedor. Solo señales a revisar."
 *     responses:
 *       200: { description: "{ desde, hasta, revisadas, conteo, hallazgos }" }
 */
export async function GET(request) {
  const { denied } = await requirePermission("viewAnomaliasCompras");
  if (denied) return denied;
  try {
    const p = new URL(request.url).searchParams;
    return NextResponse.json(await detectarAnomalias({ desde: p.get("desde"), hasta: p.get("hasta") }));
  } catch (err) {
    return apiError(err);
  }
}
