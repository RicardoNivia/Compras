import { NextResponse } from "next/server";
import { requirePermission, apiError } from "@/lib/apiGuard";
import { aprobarSolicitud } from "@/lib/solicitudesProveedorCorreo";

/**
 * @openapi
 * /api/correo/solicitudes/{id}/aprobar:
 *   post:
 *     tags: [Mi correo]
 *     summary: "Registra el proveedor de la solicitud (permiso editProveedores). El cuerpo puede corregir los campos del formulario. Si falta algo responde 400 con { error, faltantes }."
 */
export async function POST(request, { params }) {
  const { user, denied } = await requirePermission("editProveedores");
  if (denied) return denied;
  try {
    const body = await request.json().catch(() => ({}));
    return NextResponse.json(await aprobarSolicitud(user, params.id, body));
  } catch (err) {
    if (err.faltantes) return NextResponse.json({ error: err.message, faltantes: err.faltantes }, { status: 400 });
    return apiError(err);
  }
}
