import { NextResponse } from "next/server";
import { requirePermission, apiError } from "@/lib/apiGuard";
import { listBandeja } from "@/lib/notificaciones";

/**
 * @openapi
 * /api/notificaciones/bandeja:
 *   get:
 *     tags: [Notificaciones]
 *     summary: Bandeja propia (lo recibido por la app), paginada. ?soloNoLeidas=1
 */
export async function GET(request) {
  const { user, denied } = await requirePermission("viewNotificaciones");
  if (denied) return denied;
  try {
    const sp = new URL(request.url).searchParams;
    return NextResponse.json(await listBandeja(user, { page: sp.get("page"), size: sp.get("size"), soloNoLeidas: sp.get("soloNoLeidas") === "1" }));
  } catch (err) {
    return apiError(err);
  }
}
