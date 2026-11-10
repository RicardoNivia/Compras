import { NextResponse } from "next/server";
import { requirePermission, apiError } from "@/lib/apiGuard";
import { estadoCorreo, cambiarAgente, desvincular } from "@/lib/correoCuentas";

/**
 * @openapi
 * /api/correo:
 *   get:
 *     tags: [Mi correo]
 *     summary: "Estado del correo vinculado de quien consulta (modo del servidor, cuenta sin tokens, solicitudes pendientes). Permiso vincularCorreo."
 *   patch:
 *     tags: [Mi correo]
 *     summary: "Enciende o apaga el agente de correo ({ agenteActivo })."
 *   delete:
 *     tags: [Mi correo]
 *     summary: "Desvincula el correo (borra los tokens)."
 */
export async function GET() {
  const { user, denied } = await requirePermission("vincularCorreo");
  if (denied) return denied;
  try {
    return NextResponse.json(await estadoCorreo(user));
  } catch (err) {
    return apiError(err);
  }
}

export async function PATCH(request) {
  const { user, denied } = await requirePermission("vincularCorreo");
  if (denied) return denied;
  try {
    const body = await request.json().catch(() => ({}));
    return NextResponse.json({ cuenta: await cambiarAgente(user, !!body.agenteActivo) });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE() {
  const { user, denied } = await requirePermission("vincularCorreo");
  if (denied) return denied;
  try {
    return NextResponse.json(await desvincular(user));
  } catch (err) {
    return apiError(err);
  }
}
