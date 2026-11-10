import { NextResponse } from "next/server";
import { requirePermission, apiError } from "@/lib/apiGuard";
import { listCuadros, crearCuadro } from "@/lib/agenteCotizador";
import { salarioVigente } from "@/lib/salarioMinimo";

/**
 * @openapi
 * /api/agentes-compras/cotizador:
 *   get:
 *     tags: [Agentes de Compras]
 *     summary: Cuadros comparativos de Compras y el salario mínimo vigente.
 *     responses:
 *       200: { description: "{ cuadros, salario }" }
 *   post:
 *     tags: [Agentes de Compras]
 *     summary: "Con { titulo, recordId?, cotizaciones } arma y guarda el cuadro comparativo de Compras (opcionalmente adjunto a una compra). Auditado."
 *     responses:
 *       200: { description: "{ cuadro }" }
 */
export async function GET() {
  const { denied } = await requirePermission("viewAgentesCompras");
  if (denied) return denied;
  try {
    return NextResponse.json({ cuadros: await listCuadros("compras"), salario: await salarioVigente() });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(request) {
  const { user, denied } = await requirePermission("viewAgentesCompras");
  if (denied) return denied;
  try {
    const { titulo, recordId, cotizaciones } = await request.json();
    return NextResponse.json({ cuadro: await crearCuadro({ titulo, recordId, cotizaciones }, user, "compras") });
  } catch (err) {
    return apiError(err);
  }
}
