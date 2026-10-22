import { NextResponse } from "next/server";
import { requirePermission, apiError } from "@/lib/apiGuard";
import { setChecklistMasivo, cambiarEstadoMasivo } from "@/lib/proveedoresCiclo";

/**
 * @openapi
 * /api/proveedores/masivo:
 *   patch:
 *     tags: [Proveedores]
 *     summary: Acción masiva sobre varios proveedores del ciclo vigente (requiere permiso "editProveedores"). "checklist" marca todos los requisitos (cumple=true) o los restablece (cumple=false); "estado" cambia el estado del ciclo (los que no cumplen las reglas se devuelven en "omitidos").
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ids, tipo]
 *             properties:
 *               ids: { type: array, items: { type: string } }
 *               tipo: { type: string, enum: [checklist, estado] }
 *               cumple: { type: boolean }
 *               estado: { type: string }
 */
export async function PATCH(request) {
  const { user, denied } = await requirePermission("editProveedores");
  if (denied) return denied;
  try {
    const body = await request.json().catch(() => ({}));
    if (body.tipo === "checklist") return NextResponse.json(await setChecklistMasivo(body.ids, body.cumple !== false, user));
    if (body.tipo === "estado") return NextResponse.json(await cambiarEstadoMasivo(body.ids, body.estado, user, body.fechaActualizacion));
    return NextResponse.json({ error: "Tipo de acción inválido." }, { status: 400 });
  } catch (err) {
    return apiError(err);
  }
}
