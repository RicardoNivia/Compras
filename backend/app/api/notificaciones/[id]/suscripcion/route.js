import { NextResponse } from "next/server";
import { requirePermission, apiError } from "@/lib/apiGuard";
import { cambiarSuscripcion } from "@/lib/notificaciones";

/**
 * @openapi
 * /api/notificaciones/{id}/suscripcion:
 *   post:
 *     tags: [Notificaciones]
 *     summary: "El destinatario deja de recibir o vuelve a recibir. Body: { accion: baja | alta }. Queda en auditoría."
 */
export async function POST(request, { params }) {
  const { user, denied } = await requirePermission("viewNotificaciones");
  if (denied) return denied;
  try {
    const { accion } = await request.json();
    return NextResponse.json(await cambiarSuscripcion(params.id, accion, user));
  } catch (err) {
    return apiError(err);
  }
}
