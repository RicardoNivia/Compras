import { NextResponse } from "next/server";
import { requireAlgunPermiso, featureDeLinea, apiError } from "@/lib/apiGuard";
import { isRoleAllowed } from "@/lib/permissions";
import { listPropuestas, buscarPropuestas, estadoAsociador, resolverVarias } from "@/lib/agenteAsociador";
import { estadoAgente, activarAgente } from "@/lib/configAgentes";

const EDITAR = ["editBienestar", "editFundacion"];

/**
 * @openapi
 * /api/actividades/agentes/asociador:
 *   get:
 *     tags: [Bienestar]
 *     summary: Propuestas del agente asociador (compras del área Bienestar sin actividad) y si está buscando. Requiere editar Bienestar o Fundación.
 *     responses:
 *       200: { description: "{ propuestas, estado, revisionDiaria }" }
 *   post:
 *     tags: [Bienestar]
 *     summary: "accion: buscar (en segundo plano, sin avisos) | revisionDiaria ({ activo }: enciende o apaga la revisión automática, auditado) | aceptar | descartar, con ids. Aceptar asocia la compra (auditado) y exige editar la línea de la actividad."
 *     responses:
 *       200: { description: "{ ok } o { hechas, errores }" }
 */
export async function GET() {
  const { denied } = await requireAlgunPermiso(EDITAR);
  if (denied) return denied;
  try {
    return NextResponse.json({ propuestas: await listPropuestas(), estado: estadoAsociador(), revisionDiaria: await estadoAgente("asociador") });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(request) {
  const { user, denied } = await requireAlgunPermiso(EDITAR);
  if (denied) return denied;
  try {
    const body = await request.json();
    if (body.accion === "revisionDiaria") return NextResponse.json({ revisionDiaria: await activarAgente("asociador", !!body.activo, user) });
    if (body.accion === "buscar") {
      if (estadoAsociador().corriendo) return NextResponse.json({ ok: true, yaCorriendo: true });
      buscarPropuestas({ actor: user }).catch((e) => console.error("[agente asociador]", e.message));
      return NextResponse.json({ ok: true });
    }
    if (body.accion !== "aceptar" && body.accion !== "descartar") return NextResponse.json({ error: "Acción inválida." }, { status: 400 });
    const ids = (Array.isArray(body.ids) ? body.ids : []).map(Number).filter(Boolean);
    if (!ids.length) return NextResponse.json({ error: "Elige al menos una propuesta." }, { status: 400 });
    const puedeLinea = (linea) => isRoleAllowed(user.role, featureDeLinea("editar", linea));
    return NextResponse.json(await resolverVarias(ids, body.accion, user, puedeLinea));
  } catch (err) {
    return apiError(err);
  }
}
