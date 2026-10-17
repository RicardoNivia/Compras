import { NextResponse } from "next/server";
import { requirePermission, apiError } from "@/lib/apiGuard";
import { listEjecuciones } from "@/lib/notificaciones";

/**
 * @openapi
 * /api/notificaciones/{id}/ejecuciones:
 *   get:
 *     tags: [Notificaciones]
 *     summary: Historial paginado de ejecuciones con sus entregas (un destinatario solo ve las suyas).
 */
export async function GET(request, { params }) {
  const { user, denied } = await requirePermission("viewNotificaciones");
  if (denied) return denied;
  try {
    const sp = new URL(request.url).searchParams;
    return NextResponse.json(await listEjecuciones(params.id, user, { page: sp.get("page"), size: sp.get("size") }));
  } catch (err) {
    return apiError(err);
  }
}
