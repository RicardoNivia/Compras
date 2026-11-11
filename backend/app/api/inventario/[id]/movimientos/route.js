import { NextResponse } from "next/server";
import { requireAlgunPermiso, apiError } from "@/lib/apiGuard";
import { listMovimientos, registrarMovimiento } from "@/lib/inventarioBodega";

/**
 * @openapi
 * /api/inventario/{id}/movimientos:
 *   get:
 *     tags: [Bienestar]
 *     summary: Historial de movimientos de un artículo (con la compra o la actividad de origen). Ver Bienestar o Fundación.
 *   post:
 *     tags: [Bienestar]
 *     summary: Registra un movimiento a mano ({ tipo entrada|salida, cantidad, motivo } o { tipo ajuste, conteo, motivo }). Una salida nunca deja el stock negativo (409). Editar Bienestar o Fundación.
 */
export async function GET(_request, { params }) {
  const { denied } = await requireAlgunPermiso(["viewBienestar", "viewFundacion"]);
  if (denied) return denied;
  try {
    return NextResponse.json(await listMovimientos(params.id));
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(request, { params }) {
  const { user, denied } = await requireAlgunPermiso(["editBienestar", "editFundacion"]);
  if (denied) return denied;
  try {
    return NextResponse.json(await registrarMovimiento(params.id, await request.json(), user), { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
