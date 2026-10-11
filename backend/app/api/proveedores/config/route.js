import { NextResponse } from "next/server";
import { requirePermission, apiError } from "@/lib/apiGuard";
import { getConfigProveedores, updateConfigProveedores } from "@/lib/proveedoresCiclo";

/**
 * @openapi
 * /api/proveedores/config:
 *   get:
 *     tags: [Proveedores]
 *     summary: Fecha de corte del ciclo de actualización (requiere permiso "viewProveedores").
 *   put:
 *     tags: [Proveedores]
 *     summary: Cambia la fecha de corte y los días de aviso (requiere permiso editProveedores, es decir admin o rol Proveedores). Aplica desde el próximo ciclo.
 */
export async function GET() {
  const { denied } = await requirePermission("viewProveedores");
  if (denied) return denied;
  try {
    return NextResponse.json(await getConfigProveedores());
  } catch (err) {
    return apiError(err);
  }
}

export async function PUT(request) {
  const { user, denied } = await requirePermission("editProveedores");
  if (denied) return denied;
  try {
    const body = await request.json().catch(() => ({}));
    return NextResponse.json(await updateConfigProveedores(body, user));
  } catch (err) {
    return apiError(err);
  }
}
