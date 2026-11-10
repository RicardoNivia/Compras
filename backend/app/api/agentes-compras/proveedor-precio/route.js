import { NextResponse } from "next/server";
import { requireAlgunPermiso, apiError } from "@/lib/apiGuard";
import { proveedorYPrecio } from "@/lib/agentesCompras";

/**
 * @openapi
 * /api/agentes-compras/proveedor-precio:
 *   post:
 *     tags: [Agentes de Compras]
 *     summary: "Con { texto } (qué se va a comprar): compras parecidas, rango de precio y proveedores a los que se les compró, con su valoración de Nova y su estado en el ciclo, más la recomendación de Nova."
 *     responses:
 *       200: { description: "{ compras, referencia, proveedores, ejemplos, nova }" }
 */
export async function POST(request) {
  const { denied } = await requireAlgunPermiso(["viewAgentesCompras"]);
  if (denied) return denied;
  try {
    const { texto } = await request.json();
    return NextResponse.json(await proveedorYPrecio(texto));
  } catch (err) {
    return apiError(err);
  }
}
