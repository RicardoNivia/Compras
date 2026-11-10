import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-server";
import { apiError } from "@/lib/apiGuard";
import { listAccesos, otorgarAcceso, puedeAdministrarAccesos } from "@/lib/tesoreria/accesos";

// Quién tiene acceso a Tesorería. Lo administra quien firma (o un admin del panel mientras la lista está vacía).
/**
 * @openapi
 * /api/tesoreria/accesos:
 *   get:
 *     tags: [Tesorería]
 *     summary: "Lista de personas con acceso a Tesorería (solo quien administra accesos)."
 *   post:
 *     tags: [Tesorería]
 *     summary: "Da o cambia el acceso de una persona ({ userId, nivel: consulta|registro|firma })."
 */
async function guardia() {
  const user = await getSessionUser();
  if (!user) return { denied: NextResponse.json({ error: "No autenticado." }, { status: 401 }) };
  if (!(await puedeAdministrarAccesos(user))) return { denied: NextResponse.json({ error: "Solo quien firma en Tesorería administra los accesos." }, { status: 403 }) };
  return { user };
}

export async function GET() {
  const { denied } = await guardia();
  if (denied) return denied;
  try {
    return NextResponse.json({ accesos: await listAccesos() });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(request) {
  const { user, denied } = await guardia();
  if (denied) return denied;
  try {
    const body = await request.json().catch(() => ({}));
    await otorgarAcceso(user, body);
    return NextResponse.json({ accesos: await listAccesos() });
  } catch (err) {
    return apiError(err);
  }
}
