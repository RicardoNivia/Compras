import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/apiGuard";
import { estadoTeams } from "@/lib/teams";

/**
 * @openapi
 * /api/notificaciones/canales:
 *   get:
 *     tags: [Notificaciones]
 *     summary: Estado de cada canal (app siempre; Teams real/simulado/desactivado según el servidor; correo deshabilitado) y si se puede elegir canal. Nunca devuelve la URL del webhook.
 */
export async function GET() {
  const { denied } = await requirePermission("viewNotificaciones");
  if (denied) return denied;
  const t = estadoTeams();
  // Elegir canal (Teams / correo) se ofrece en todos los entornos. Teams solo funciona donde el servidor tenga
  // TEAMS_MODO/TEAMS_WEBHOOK_URL; si no, la opción aparece apagada. NOTIFICACIONES_ELEGIR_CANAL=0 la oculta.
  const local = process.env.NODE_ENV !== "production";
  const elegirCanal = process.env.NOTIFICACIONES_ELEGIR_CANAL !== "0";
  return NextResponse.json({ app: true, teams: t.modo, teamsDestinoPrueba: t.destinoPrueba, correo: false, local, elegirCanal });
}
