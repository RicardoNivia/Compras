import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-server";
import { apiError } from "@/lib/apiGuard";
import { listCompartidos } from "@/lib/reportCompartidos";

/**
 * @openapi
 * /api/reports/compartidos:
 *   get:
 *     tags: [Informes]
 *     summary: Informes solo para consultar que el usuario de la sesión puede ver (los creó, es administrador o le dieron acceso). No requiere el permiso de Informes.
 *     responses:
 *       200:
 *         description: Informes.
 *         content:
 *           application/json:
 *             schema: { type: object, properties: { informes: { type: array, items: { type: object } } } }
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  try {
    return NextResponse.json({ informes: await listCompartidos(user) });
  } catch (err) {
    return apiError(err);
  }
}
