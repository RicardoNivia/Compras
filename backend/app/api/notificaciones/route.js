import { NextResponse } from "next/server";
import { requirePermission, apiError } from "@/lib/apiGuard";
import { listNotificaciones, createNotificacion } from "@/lib/notificaciones";

// Notificaciones configurables por prompt (ver docs/notificaciones-diseno.md).
/**
 * @openapi
 * /api/notificaciones:
 *   get:
 *     tags: [Notificaciones]
 *     summary: Lista paginada. ver = mias (las que creé) | recibo (de otros que me llegan) | todas (solo admin). Requiere "viewNotificaciones".
 *     responses:
 *       200: { description: Página de notificaciones. }
 *   post:
 *     tags: [Notificaciones]
 *     summary: Crea una notificación (la regla ya confirmada). El creador y cada destinatario deben poder ver la fuente de datos.
 *     responses:
 *       201: { description: Creada. }
 *       400: { description: Regla inválida o límite alcanzado. }
 *       403: { description: Sin permiso sobre los datos. }
 */
export async function GET(request) {
  const { user, denied } = await requirePermission("viewNotificaciones");
  if (denied) return denied;
  try {
    const sp = new URL(request.url).searchParams;
    return NextResponse.json(await listNotificaciones(user, { ver: sp.get("ver") || "mias", estado: sp.get("estado"), q: sp.get("q"), page: sp.get("page"), size: sp.get("size") }));
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(request) {
  const { user, denied } = await requirePermission("viewNotificaciones");
  if (denied) return denied;
  try {
    return NextResponse.json(await createNotificacion(await request.json(), user), { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
