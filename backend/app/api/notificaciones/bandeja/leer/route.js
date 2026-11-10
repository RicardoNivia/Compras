import { NextResponse } from "next/server";
import { requirePermission, apiError } from "@/lib/apiGuard";
import { marcarLeidas } from "@/lib/notificaciones";

/**
 * @openapi
 * /api/notificaciones/bandeja/leer:
 *   post:
 *     tags: [Notificaciones]
 *     summary: "Marca como leídas. Body: { ids: number[] } o { todas: true }."
 */
export async function POST(request) {
  const { user, denied } = await requirePermission("viewNotificaciones");
  if (denied) return denied;
  try {
    return NextResponse.json(await marcarLeidas(user, await request.json()));
  } catch (err) {
    return apiError(err);
  }
}
