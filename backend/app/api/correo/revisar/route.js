import { NextResponse } from "next/server";
import { requirePermission, apiError } from "@/lib/apiGuard";
import { revisarMiCorreo } from "@/lib/agenteCorreoProveedores";

/**
 * @openapi
 * /api/correo/revisar:
 *   post:
 *     tags: [Mi correo]
 *     summary: "Revisar ahora: el agente lee los correos nuevos del buzón de quien lo pide. Devuelve { revisados, analizados, solicitudes }."
 */
export async function POST() {
  const { user, denied } = await requirePermission("vincularCorreo");
  if (denied) return denied;
  try {
    return NextResponse.json(await revisarMiCorreo(user));
  } catch (err) {
    return apiError(err);
  }
}
