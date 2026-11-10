import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-server";
import { personasDisponibles, puedeAdministrarAccesos } from "@/lib/tesoreria/accesos";

/**
 * @openapi
 * /api/tesoreria/accesos/personas:
 *   get:
 *     tags: [Tesorería]
 *     summary: "Personas activas del panel que aún no tienen acceso a Tesorería (para darles acceso)."
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user || !(await puedeAdministrarAccesos(user))) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  return NextResponse.json({ personas: await personasDisponibles() });
}
