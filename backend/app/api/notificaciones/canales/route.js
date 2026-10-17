import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/apiGuard";
import { estadoTeams } from "@/lib/teams";

/**
 * @openapi
 * /api/notificaciones/canales:
 *   get:
 *     tags: [Notificaciones]
 *     summary: Estado de cada canal (app siempre; Teams real/simulado/desactivado; correo deshabilitado) y si se puede elegir canal (por ahora solo en local). Nunca devuelve la URL del webhook.
 */
export async function GET() {
  const { denied } = await requirePermission("viewNotificaciones");
  if (denied) return denied;
  const t = estadoTeams();
  // Por ahora elegir canal (Teams / correo) solo se ofrece en local; en producción todo llega a la app.
  // NOTIFICACIONES_ELEGIR_CANAL=1 lo habilita en otro entorno cuando Teams esté listo allá.
  const local = process.env.NODE_ENV !== "production";
  const elegirCanal = local || process.env.NOTIFICACIONES_ELEGIR_CANAL === "1";
  return NextResponse.json({ app: true, teams: t.modo, teamsDestinoPrueba: t.destinoPrueba, correo: false, local, elegirCanal });
}
