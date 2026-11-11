import { NextResponse } from "next/server";
import { requirePermission, apiError } from "@/lib/apiGuard";
import { listSolicitudes } from "@/lib/solicitudesProveedorCorreo";

/**
 * @openapi
 * /api/correo/solicitudes:
 *   get:
 *     tags: [Mi correo]
 *     summary: "Solicitudes de proveedor que el agente encontró en el correo de quien consulta (paginado: estado, page, size)."
 */
export async function GET(request) {
  const { user, denied } = await requirePermission("vincularCorreo");
  if (denied) return denied;
  try {
    const q = new URL(request.url).searchParams;
    const size = [10, 25, 50, 100].includes(Number(q.get("size"))) ? Number(q.get("size")) : 10;
    const estado = ["pendiente", "aprobada", "descartada"].includes(q.get("estado")) ? q.get("estado") : undefined;
    return NextResponse.json(await listSolicitudes(user, { estado, page: Number(q.get("page")) || 1, size }));
  } catch (err) {
    return apiError(err);
  }
}
