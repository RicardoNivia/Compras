import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-server";
import { apiError, requirePermission } from "@/lib/apiGuard";
import { estadoBuzon, guardarBuzon, cambiarAgenteBuzon, quitarBuzon } from "@/lib/buzonCompartido";

// Correo de soportes (Gmail compartido, sin dueño): solo lo configura un administrador.
async function soloAdmin() {
  const user = await getSessionUser();
  if (!user) return { denied: NextResponse.json({ error: "No autenticado." }, { status: 401 }) };
  if (user.role !== "admin") return { denied: NextResponse.json({ error: "Solo un administrador configura el correo de soportes." }, { status: 403 }) };
  return { user };
}

/**
 * @openapi
 * /api/correo/compartido:
 *   get:
 *     tags: [Mi correo]
 *     summary: "Estado del correo de soportes (Gmail compartido): buzón, agente, última revisión y pendientes (sin la contraseña). Permiso vincularCorreo; configurarlo es solo de admin."
 *   put:
 *     tags: [Mi correo]
 *     summary: "Configura el correo de soportes ({ email, clave } — contraseña de aplicación de Google). Prueba la conexión antes de guardar. Solo admin."
 *   patch:
 *     tags: [Mi correo]
 *     summary: "Enciende o apaga el agente del correo de soportes ({ agenteActivo }). Solo admin."
 *   delete:
 *     tags: [Mi correo]
 *     summary: "Quita el correo de soportes (borra la contraseña guardada; lo que ya llegó se conserva). Solo admin."
 */
export async function GET() {
  const { denied } = await requirePermission("vincularCorreo");
  if (denied) return denied;
  try { return NextResponse.json(await estadoBuzon()); } catch (err) { return apiError(err); }
}

export async function PUT(request) {
  const { user, denied } = await soloAdmin();
  if (denied) return denied;
  try {
    const body = await request.json().catch(() => ({}));
    return NextResponse.json(await guardarBuzon(user, body));
  } catch (err) { return apiError(err); }
}

export async function PATCH(request) {
  const { user, denied } = await soloAdmin();
  if (denied) return denied;
  try {
    const body = await request.json().catch(() => ({}));
    return NextResponse.json({ cuenta: await cambiarAgenteBuzon(user, !!body.agenteActivo) });
  } catch (err) { return apiError(err); }
}

export async function DELETE() {
  const { user, denied } = await soloAdmin();
  if (denied) return denied;
  try { return NextResponse.json(await quitarBuzon(user)); } catch (err) { return apiError(err); }
}
