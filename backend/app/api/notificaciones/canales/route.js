import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/apiGuard";
import { estadoTeams } from "@/lib/teams";

/**
 * @openapi
 * /api/notificaciones/canales:
 *   get:
 *     tags: [Notificaciones]
 *     summary: Estado de cada canal (app siempre; Teams real/simulado/desactivado; correo deshabilitado). Nunca devuelve la URL del webhook.
 */
export async function GET() {
  const { denied } = await requirePermission("viewNotificaciones");
  if (denied) return denied;
  const t = estadoTeams();
  return NextResponse.json({ app: true, teams: t.modo, teamsDestinoPrueba: t.destinoPrueba, correo: false });
}
