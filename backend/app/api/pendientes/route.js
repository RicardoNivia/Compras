import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-server";
import { isRoleAllowed } from "@/lib/permissions";
import { apiError } from "@/lib/apiGuard";
import { getPendientes } from "@/lib/pendientes";

/**
 * @openapi
 * /api/pendientes:
 *   get:
 *     tags: [Alertas]
 *     summary: Mi día — lo que le toca hacer hoy al usuario según su rol, en secciones por urgencia (compras por radicar o legalizar, solicitudes atrasadas, proveedores por actualizar, presupuesto, valoraciones de Nova). Requiere el permiso viewAlertas.
 *     responses:
 *       200: { description: "{ rol, fecha, totales: { total, criticos, atencion }, contexto, secciones: [{ clave, titulo, descripcion, dominio, total, criticos, nivel, items: [...] }] }" }
 *       403: { description: No autorizado. }
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  if (!(await isRoleAllowed(user.role, "viewAlertas"))) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  try {
    return NextResponse.json(await getPendientes(user));
  } catch (err) {
    return apiError(err);
  }
}
