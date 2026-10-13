import { NextResponse } from "next/server";
import { requirePermission, apiError } from "@/lib/apiGuard";
import { setDocumentoCiclo } from "@/lib/proveedoresCiclo";

/**
 * @openapi
 * /api/proveedores/{nit}/ciclo/documentos:
 *   patch:
 *     tags: [Proveedores]
 *     summary: Marca o desmarca un documento manual del checklist (RUT, certificación bancaria, listas restrictivas) en el ciclo vigente (requiere permiso "editProveedores").
 */
export async function PATCH(request, { params }) {
  const { user, denied } = await requirePermission("editProveedores");
  if (denied) return denied;
  try {
    const body = await request.json().catch(() => ({}));
    return NextResponse.json(await setDocumentoCiclo(params.nit, { clave: body.clave, cumple: body.cumple }, user));
  } catch (err) {
    return apiError(err);
  }
}
