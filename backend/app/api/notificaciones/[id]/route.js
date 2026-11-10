import { NextResponse } from "next/server";
import { requirePermission, apiError } from "@/lib/apiGuard";
import { getNotificacion, toClient, updateNotificacion, deleteNotificacion } from "@/lib/notificaciones";
import { puedeGestionar } from "@/lib/notificacionesPermisos";

/**
 * @openapi
 * /api/notificaciones/{id}:
 *   get:
 *     tags: [Notificaciones]
 *     summary: Detalle (propietario, admin o destinatario).
 *   put:
 *     tags: [Notificaciones]
 *     summary: Edita (propietario o admin). Los permisos de datos se evalúan con el propietario.
 *   delete:
 *     tags: [Notificaciones]
 *     summary: Elimina (propietario o admin).
 */
export async function GET(request, { params }) {
  const { user, denied } = await requirePermission("viewNotificaciones");
  if (denied) return denied;
  try {
    const n = await getNotificacion(params.id);
    if (!puedeGestionar(user, n) && !n.destinatarios.some((d) => d.userId === user.id)) {
      return NextResponse.json({ error: "No autorizado." }, { status: 403 });
    }
    return NextResponse.json(toClient(n, user));
  } catch (err) {
    return apiError(err);
  }
}

export async function PUT(request, { params }) {
  const { user, denied } = await requirePermission("viewNotificaciones");
  if (denied) return denied;
  try {
    return NextResponse.json(await updateNotificacion(params.id, await request.json(), user));
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(request, { params }) {
  const { user, denied } = await requirePermission("viewNotificaciones");
  if (denied) return denied;
  try {
    await deleteNotificacion(params.id, user);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
