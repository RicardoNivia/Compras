import { NextResponse } from "next/server";
import { requirePermission, apiError } from "@/lib/apiGuard";
import { vigiaPresupuesto, detectarAnomalias, lecturaNova, paraNova } from "@/lib/agentesCompras";

/**
 * @openapi
 * /api/agentes-compras/lectura:
 *   post:
 *     tags: [Agentes de Compras]
 *     summary: "Lectura de Nova a pedido. { tipo: 'presupuesto', anio } o { tipo: 'anomalias', desde, hasta }: el servidor vuelve a calcular las cifras (nunca toma las del cliente) y Nova las explica en puntos."
 *     responses:
 *       200: { description: "{ puntos }" }
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const tipo = body?.tipo === "presupuesto" ? "presupuesto" : "anomalias";
    const { denied } = await requirePermission(tipo === "presupuesto" ? "viewPresupuesto" : "viewAnomaliasCompras");
    if (denied) return denied;
    const datos = tipo === "presupuesto" ? await vigiaPresupuesto(body.anio) : await detectarAnomalias({ desde: body.desde, hasta: body.hasta });
    return NextResponse.json({ puntos: await lecturaNova(tipo, paraNova(tipo, datos)) });
  } catch (err) {
    return apiError(err);
  }
}
