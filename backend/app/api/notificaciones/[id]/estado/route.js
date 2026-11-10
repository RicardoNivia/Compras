import { NextResponse } from "next/server";
import { requirePermission, apiError } from "@/lib/apiGuard";
import { cambiarEstado } from "@/lib/notificaciones";

/**
 * @openapi
 * /api/notificaciones/{id}/estado:
 *   post:
 *     tags: [Notificaciones]
 *     summary: "Pausa o reanuda (propietario o admin). Body: { accion: pausar | reanudar, motivo? }"
 */
export async function POST(request, { params }) {
  const { user, denied } = await requirePermission("viewNotificaciones");
  if (denied) return denied;
  try {
    const { accion, motivo } = await request.json();
    return NextResponse.json(await cambiarEstado(params.id, accion, user, motivo));
  } catch (err) {
    return apiError(err);
  }
}
