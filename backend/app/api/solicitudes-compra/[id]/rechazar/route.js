import { NextResponse } from "next/server";
import { requirePermission, apiError } from "@/lib/apiGuard";
import { rechazarSolicitud } from "@/lib/solicitudesCompra";

/**
 * @openapi
 * /api/solicitudes-compra/{id}/rechazar:
 *   post:
 *     tags: [Bienestar]
 *     summary: Rechaza la solicitud; exige el motivo ({ motivo }). Requiere createRecord.
 */
export async function POST(request, { params }) {
  const { user, denied } = await requirePermission("createRecord");
  if (denied) return denied;
  try {
    const body = await request.json().catch(() => ({}));
    await rechazarSolicitud(params.id, body.motivo, user);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
