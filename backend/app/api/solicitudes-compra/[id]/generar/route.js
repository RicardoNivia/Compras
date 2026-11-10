import { NextResponse } from "next/server";
import { requirePermission, apiError } from "@/lib/apiGuard";
import { generarCompra } from "@/lib/solicitudesCompra";

/**
 * @openapi
 * /api/solicitudes-compra/{id}/generar:
 *   post:
 *     tags: [Bienestar]
 *     summary: Crea la compra con los datos del formulario y la asocia a la actividad de la solicitud. Requiere createRecord.
 */
export async function POST(request, { params }) {
  const { user, denied } = await requirePermission("createRecord");
  if (denied) return denied;
  try {
    return NextResponse.json(await generarCompra(params.id, await request.json(), user), { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
