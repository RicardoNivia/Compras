import { NextResponse } from "next/server";
import { requireAlgunPermiso, apiError } from "@/lib/apiGuard";
import { listCuadros, crearCuadro } from "@/lib/agenteCotizador";
import { salarioVigente } from "@/lib/salarioMinimo";

const EDITAR = ["editBienestar", "editFundacion"];

/**
 * @openapi
 * /api/actividades/agentes/cotizador:
 *   get:
 *     tags: [Bienestar]
 *     summary: Cuadros comparativos guardados y el salario mínimo vigente (de Maestros) con que se mide el umbral del procedimiento. Requiere editar Bienestar o Fundación.
 *     responses:
 *       200: { description: "{ cuadros, salario }" }
 *   post:
 *     tags: [Bienestar]
 *     summary: "Con { titulo, actividadId?, cotizaciones } (las leídas con /extraer): calcula la comparación, pide la recomendación a Nova y guarda el cuadro (auditado)."
 *     responses:
 *       200: { description: "{ cuadro }" }
 */
export async function GET() {
  const { denied } = await requireAlgunPermiso(EDITAR);
  if (denied) return denied;
  try {
    return NextResponse.json({ cuadros: await listCuadros(), salario: await salarioVigente() });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(request) {
  const { user, denied } = await requireAlgunPermiso(EDITAR);
  if (denied) return denied;
  try {
    return NextResponse.json({ cuadro: await crearCuadro(await request.json(), user) });
  } catch (err) {
    return apiError(err);
  }
}
