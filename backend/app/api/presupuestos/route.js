import { NextResponse } from "next/server";
import { listPresupuestos, upsertPresupuesto } from "@/lib/presupuestos";
import { getSessionUser } from "@/lib/auth-server";
import { isRoleAllowed } from "@/lib/permissions";

// El tema de presupuesto queda restringido por la funcionalidad
// "viewPresupuesto" de la Matriz de permisos (por defecto, solo admin):
// también la lectura, no solo crear/editar/eliminar.
/**
 * @openapi
 * /api/presupuestos:
 *   get:
 *     tags: [Presupuesto]
 *     summary: Lista los presupuestos configurados, opcionalmente filtrados por año (requiere permiso "viewPresupuesto").
 *     parameters:
 *       - { name: anio, in: query, schema: { type: integer }, description: "Si se omite, devuelve los presupuestos de todos los años (sin el campo modo)." }
 *     responses:
 *       200:
 *         description: Presupuestos.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 presupuestos:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: string }
 *                       area: { type: string }
 *                       anio: { type: integer }
 *                       modo: { type: string, enum: [area, categoria] }
 *                       valorArea: { type: number, nullable: true }
 *                       categorias: { type: array, items: { type: object, properties: { id: { type: string }, categoria: { type: string }, valor: { type: number } } } }
 *                       total: { type: number }
 *                       updatedAt: { type: string, format: date-time }
 *                 modo: { type: string, nullable: true, enum: [area, categoria], description: "Solo presente cuando se filtra por un año." }
 *       403:
 *         description: No autorizado.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
export async function GET(request) {
  const user = await getSessionUser();
  if (!user || !(await isRoleAllowed(user.role, "viewPresupuesto"))) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }
  const { searchParams } = new URL(request.url);
  const anio = searchParams.get("anio") || undefined;
  try {
    const result = await listPresupuestos({ anio });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}

/**
 * @openapi
 * /api/presupuestos:
 *   post:
 *     tags: [Presupuesto]
 *     summary: Crea o reemplaza el presupuesto de un área para un año, en el modo vigente de ese año (requiere permiso "viewPresupuesto"; el modo del año se define antes con POST /api/presupuestos/modo).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [area, anio]
 *             properties:
 *               area: { type: string }
 *               anio: { type: integer }
 *               valorArea: { type: number, description: "Requerido si el modo del año es \"area\"." }
 *               categorias:
 *                 type: array
 *                 description: "Requerido (al menos una) si el modo del año es \"categoria\"."
 *                 items: { type: object, properties: { categoria: { type: string }, valor: { type: number } } }
 *     responses:
 *       201:
 *         description: Presupuesto creado o reemplazado.
 *         content:
 *           application/json:
 *             schema: { type: object, description: "Ver schema de presupuesto en GET /api/presupuestos." }
 *       400:
 *         description: Datos inválidos, o el año todavía no tiene modo definido.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       403:
 *         description: No autorizado.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
export async function POST(request) {
  const user = await getSessionUser();
  if (!user || !(await isRoleAllowed(user.role, "viewPresupuesto"))) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }
  try {
    const body = await request.json();
    const presupuesto = await upsertPresupuesto(body, user);
    return NextResponse.json(presupuesto, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}
