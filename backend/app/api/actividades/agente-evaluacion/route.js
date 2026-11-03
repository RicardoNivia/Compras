import { NextResponse } from "next/server";
import { requireAlgunPermiso, apiError } from "@/lib/apiGuard";
import { isRoleAllowed } from "@/lib/permissions";
import { vistaPrevia, estadoTrabajo, iniciarTrabajo, detenerTrabajo } from "@/lib/agenteEvaluacion";

const FEATURES = ["editBienestar", "editFundacion"];

// Solo las líneas que la persona puede editar.
async function lineasDe(user) {
  const out = [];
  if (await isRoleAllowed(user.role, "editBienestar")) out.push("Bienestar");
  if (await isRoleAllowed(user.role, "editFundacion")) out.push("Fundación");
  return out;
}

/**
 * @openapi
 * /api/actividades/agente-evaluacion:
 *   get:
 *     tags: [Bienestar]
 *     summary: Qué actividades cambiaron después de su calificación (según Auditoría) y cuántos análisis se actualizarían; con ?estado=1, solo el avance del trabajo. Requiere poder editar Bienestar o Fundación.
 *   post:
 *     tags: [Bienestar]
 *     summary: Inicia el agente en segundo plano. Exige { confirmar true }, porque tiene costo en IA.
 *   delete:
 *     tags: [Bienestar]
 *     summary: Detiene el agente en curso; lo ya reevaluado se conserva.
 */
export async function GET(request) {
  const { user, denied } = await requireAlgunPermiso(FEATURES);
  if (denied) return denied;
  try {
    const { searchParams } = new URL(request.url);
    if (searchParams.get("estado")) return NextResponse.json({ trabajo: estadoTrabajo() });
    return NextResponse.json(await vistaPrevia(await lineasDe(user)));
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(request) {
  const { user, denied } = await requireAlgunPermiso(FEATURES);
  if (denied) return denied;
  try {
    const body = await request.json().catch(() => ({}));
    // "todas" solo se usa al desplegar (lib/agenteDespliegue.js): desde la pantalla, solo lo que cambió.
    return NextResponse.json({ trabajo: await iniciarTrabajo(await lineasDe(user), { confirmar: body.confirmar }, user) }, { status: 202 });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE() {
  const { user, denied } = await requireAlgunPermiso(FEATURES);
  if (denied) return denied;
  try {
    return NextResponse.json({ trabajo: detenerTrabajo(user) });
  } catch (err) {
    return apiError(err);
  }
}
