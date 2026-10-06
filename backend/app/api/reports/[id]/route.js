import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-server";
import { isRoleAllowed } from "@/lib/permissions";
import { updateReport, deleteReport } from "@/lib/reports";

async function guard() {
  const user = await getSessionUser();
  if (!user || !(await isRoleAllowed(user.role, "viewReportes"))) return null;
  return user;
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
  const user = await guard();
  if (!user) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  try {
    const body = await request.json();
    const report = await updateReport(params.id, body, user);
    return NextResponse.json(report);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
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
  const user = await guard();
  if (!user) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  try {
    await deleteReport(params.id, user);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}
