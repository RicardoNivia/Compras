import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-server";
import { accesoDe } from "@/lib/tesoreria/comun";
import { puedeAdministrarAccesos } from "@/lib/tesoreria/accesos";

/**
 * @openapi
 * /api/tesoreria/acceso:
 *   get:
 *     tags: [Tesorería]
 *     summary: "Acceso nominal de quien consulta a Tesorería ({ acceso: { nivel, puedeRegistrar, puedeFirmar } | null, puedeAdministrarAccesos })."
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  return NextResponse.json({ acceso: await accesoDe(user.id), puedeAdministrarAccesos: await puedeAdministrarAccesos(user) });
}
