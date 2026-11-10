import { NextResponse } from "next/server";
import { requirePermission, apiError } from "@/lib/apiGuard";
import { ejecutarNotificacion } from "@/lib/notificacionesMotor";

/**
 * @openapi
 * /api/notificaciones/{id}/enviar:
 *   post:
 *     tags: [Notificaciones]
 *     summary: Envío manual inmediato a TODOS los destinatarios (propietario o admin). Queda en el historial con origen "manual" y en auditoría; el mensaje dice "Enviada manualmente por …". No reemplaza el envío programado del día.
 */
export async function POST(request, { params }) {
  const { user, denied } = await requirePermission("viewNotificaciones");
  if (denied) return denied;
  try {
    return NextResponse.json(await ejecutarNotificacion(params.id, { origen: "manual", actor: user }));
  } catch (err) {
    return apiError(err);
  }
}
