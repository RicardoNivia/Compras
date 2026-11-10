import { NextResponse } from "next/server";
import { requirePermission, apiError } from "@/lib/apiGuard";
import { interpretarPedido } from "@/lib/notificacionesNova";

/**
 * @openapi
 * /api/notificaciones/nova/interpretar:
 *   post:
 *     tags: [Notificaciones]
 *     summary: "Nova convierte el pedido en una regla o hace preguntas. Body: { pedido, respuestas, reglaParcial, turno }. Devuelve estado preguntas | lista | no_permitido | es_informe | no_soportado | manual."
 */
export async function POST(request) {
  const { user, denied } = await requirePermission("viewNotificaciones");
  if (denied) return denied;
  try {
    return NextResponse.json(await interpretarPedido(await request.json(), user));
  } catch (err) {
    return apiError(err);
  }
}
