import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/apiGuard";
import { contarNoLeidas, nuevasDesde } from "@/lib/notificaciones";
import { isRoleAllowed } from "@/lib/permissions";
import { contarPendientes } from "@/lib/solicitudesCompra";

/**
 * @openapi
 * /api/notificaciones/bandeja/no-leidas:
 *   get:
 *     tags: [Notificaciones]
 *     summary: Número de notificaciones no leídas de este módulo y, para quien puede crear compras, las solicitudes de compra pendientes (contador rojo; no incluye Mi día). Con ?desde={id} devuelve además las entregas nuevas para los avisos en vivo (toasts).
 */
export async function GET(request) {
  const { user, denied } = await requirePermission("viewNotificaciones");
  if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const [noLeidas, solicitudes, vivo] = await Promise.all([
    contarNoLeidas(user).catch(() => 0),
    isRoleAllowed(user.role, "createRecord").then((puede) => (puede ? contarPendientes() : 0)).catch(() => 0),
    sp.has("vivo") ? nuevasDesde(user, sp.get("desde")).catch(() => null) : null,
  ]);
  return NextResponse.json({ noLeidas, solicitudes, ...(vivo || {}) });
}
