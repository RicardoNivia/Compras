import { NextResponse } from "next/server";
import { requireAlgunPermiso, apiError } from "@/lib/apiGuard";
import { revisarCompra } from "@/lib/agentesCompras";

/**
 * @openapi
 * /api/agentes-compras/revisar:
 *   post:
 *     tags: [Agentes de Compras]
 *     summary: "Revisor de una compra antes de guardarla. Con { borrador, id? } (los campos del formulario) devuelve los hallazgos calculados (umbral del cuadro comparativo, compra partida, proveedor, duplicados, precio frente al historial) y la lectura de Nova (categoría y resumen). No guarda nada."
 *     responses:
 *       200: { description: "{ hallazgos, referencia, nova, smmlv }" }
 */
export async function POST(request) {
  const { denied } = await requireAlgunPermiso(["viewAgentesCompras"]);
  if (denied) return denied;
  try {
    const { borrador, id } = await request.json();
    return NextResponse.json(await revisarCompra(borrador, { id: id || null }));
  } catch (err) {
    return apiError(err);
  }
}
