import { NextResponse } from "next/server";
import { requirePermission, apiError } from "@/lib/apiGuard";
import { verificarNit } from "@/lib/proveedores";

/**
 * @openapi
 * /api/proveedores/verificar-nit:
 *   get:
 *     tags: [Proveedores]
 *     summary: Validación en tiempo real del NIT al crear/editar un proveedor — dice si el NIT (normalizado, sin dígito de verificación) ya existe.
 *     parameters:
 *       - { name: nit, in: query, required: true, schema: { type: string } }
 *       - { name: excluir, in: query, required: false, schema: { type: string }, description: "NIT actual del proveedor que se está editando (no cuenta como duplicado)." }
 *     responses:
 *       200:
 *         description: "{ nit, valido, existe, proveedor: { nit, nombre, activo } | null }"
 */
export async function GET(request) {
  const { denied } = await requirePermission("editProveedores");
  if (denied) return denied;
  try {
    const sp = request.nextUrl.searchParams;
    return NextResponse.json(await verificarNit(sp.get("nit"), sp.get("excluir")));
  } catch (err) {
    return apiError(err);
  }
}
