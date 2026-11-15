import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-server";
import { apiError } from "@/lib/apiGuard";
import { revisarBuzonCompartido } from "@/lib/buzonCompartido";

/**
 * @openapi
 * /api/correo/compartido/revisar:
 *   post:
 *     tags: [Mi correo]
 *     summary: "«Revisar ahora» el correo de soportes: lee los correos nuevos y devuelve cuántos se revisaron, omitieron y leyeron con Nova. Solo admin."
 */
export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Solo un administrador revisa el correo de soportes." }, { status: 403 });
  try { return NextResponse.json(await revisarBuzonCompartido({ manual: true })); } catch (err) { return apiError(err); }
}
