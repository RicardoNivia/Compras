import { NextResponse } from "next/server";
import { requirePermission, apiError } from "@/lib/apiGuard";
import { destinatariosElegibles } from "@/lib/notificacionesPermisos";
import { FUENTES } from "@/lib/notificacionesCatalogo";

/**
 * @openapi
 * /api/notificaciones/destinatarios-elegibles:
 *   get:
 *     tags: [Notificaciones]
 *     summary: Usuarios activos que pueden recibir una notificación de esa fuente (?fuente=compras|mi_dia|proveedores|presupuesto).
 */
export async function GET(request) {
  const { denied } = await requirePermission("viewNotificaciones");
  if (denied) return denied;
  try {
    const fuente = new URL(request.url).searchParams.get("fuente");
    if (!FUENTES[fuente]) return NextResponse.json({ error: "Fuente no válida." }, { status: 400 });
    const users = await destinatariosElegibles(fuente);
    return NextResponse.json({ usuarios: users.map((u) => ({ id: u.id, nombre: u.nombre, email: u.email, role: u.role })) });
  } catch (err) {
    return apiError(err);
  }
}
