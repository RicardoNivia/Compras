import { NextResponse } from "next/server";
import { requirePermission, apiError } from "@/lib/apiGuard";
import { cambiarEstadoCiclo } from "@/lib/proveedoresCiclo";

/**
 * @openapi
 * /api/proveedores/{nit}/ciclo/estado:
 *   patch:
 *     tags: [Proveedores]
 *     summary: Mueve al proveedor de estado en el ciclo vigente (requiere permiso "editProveedores"). "actualizado" exige el checklist completo.
 */
export async function PATCH(request, { params }) {
  const { user, denied } = await requirePermission("editProveedores");
  if (denied) return denied;
  try {
    const body = await request.json().catch(() => ({}));
    return NextResponse.json(await cambiarEstadoCiclo(params.nit, { estado: body.estado }, user));
  } catch (err) {
    return apiError(err);
  }
}
