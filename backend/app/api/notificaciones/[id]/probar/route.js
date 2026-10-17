import { NextResponse } from "next/server";
import { requirePermission, apiError } from "@/lib/apiGuard";
import { ejecutarNotificacion } from "@/lib/notificacionesMotor";

/**
 * @openapi
 * /api/notificaciones/{id}/probar:
 *   post:
 *     tags: [Notificaciones]
 *     summary: Prueba con datos reales a todos los destinatarios y a quien prueba, marcada como PRUEBA (app y, si está marcado, Teams). No cuenta como envío del día ni aplica a notificaciones por evento. Queda en el historial y en auditoría.
 */
export async function POST(request, { params }) {
  const { user, denied } = await requirePermission("viewNotificaciones");
  if (denied) return denied;
  try {
    return NextResponse.json(await ejecutarNotificacion(params.id, { origen: "prueba", actor: user }));
  } catch (err) {
    return apiError(err);
  }
}
