import { NextResponse } from "next/server";
import { requirePermission, apiError } from "@/lib/apiGuard";
import { updateReport, deleteReport, getReport, toClientReport } from "@/lib/reports";

/**
 * @openapi
 * /api/reports/{id}:
 *   get:
 *     tags: [Informes]
 *     summary: Devuelve un informe con su programación, próxima fecha y configuración de entrega (requiere permiso viewReportes).
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Informe.
 *         content:
 *           application/json:
 *             schema: { type: object }
 *       404:
 *         description: Informe no encontrado.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
export async function GET(request, { params }) {
  const { denied } = await requirePermission("viewReportes");
  if (denied) return denied;
  try {
    return NextResponse.json(toClientReport(await getReport(params.id)));
  } catch (err) {
    return apiError(err);
  }
}

/**
 * @openapi
 * /api/reports/{id}:
 *   patch:
 *     tags: [Informes]
 *     summary: Edita un informe automático — actualización parcial, cada campo se guarda independiente (requiere permiso "viewReportes").
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, description: "Ver cuerpo de POST /api/reports — todos los campos opcionales." }
 *     responses:
 *       200:
 *         description: Informe actualizado.
 *         content:
 *           application/json:
 *             schema: { type: object }
 *       400:
 *         description: Datos inválidos.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       403:
 *         description: No autorizado.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: Informe no encontrado.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
export async function PATCH(request, { params }) {
  const { user, denied } = await requirePermission("viewReportes");
  if (denied) return denied;
  try {
    const body = await request.json();
    const report = await updateReport(params.id, body, user);
    return NextResponse.json(report);
  } catch (err) {
    return apiError(err);
  }
}

/**
 * @openapi
 * /api/reports/{id}:
 *   delete:
 *     tags: [Informes]
 *     summary: Elimina un informe automático (requiere permiso "viewReportes").
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Informe eliminado.
 *         content:
 *           application/json:
 *             schema: { type: object, properties: { ok: { type: boolean } } }
 *       403:
 *         description: No autorizado.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: Informe no encontrado.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
export async function DELETE(request, { params }) {
  const { user, denied } = await requirePermission("viewReportes");
  if (denied) return denied;
  try {
    await deleteReport(params.id, user);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
