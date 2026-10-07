import { NextResponse } from "next/server";
import { deletePresupuesto } from "@/lib/presupuestos";
import { requirePermission, apiError } from "@/lib/apiGuard";

/**
 * @openapi
 * /api/presupuestos/{id}:
 *   delete:
 *     tags: [Presupuesto]
 *     summary: Elimina el presupuesto de un área/año (requiere permiso "viewPresupuesto").
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Presupuesto eliminado.
 *         content:
 *           application/json:
 *             schema: { type: object, properties: { ok: { type: boolean } } }
 *       403:
 *         description: No autorizado.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: Presupuesto no encontrado.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
export async function DELETE(_request, { params }) {
  const { user, denied } = await requirePermission("viewPresupuesto");
  if (denied) return denied;
  try {
    await deletePresupuesto(params.id, user);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
