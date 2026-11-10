import { NextResponse } from "next/server";
import { setModoAnio } from "@/lib/presupuestos";
import { requirePermission } from "@/lib/apiGuard";

// Define o cambia el modo (por área / por categoría) general de un año.
// Si ya hay presupuestos configurados en otro modo, requiere body.confirm=true
// (de lo contrario responde 409 con el detalle, para que el cliente muestre
// la advertencia antes de reintentar con la confirmación).
/**
 * @openapi
 * /api/presupuestos/modo:
 *   post:
 *     tags: [Presupuesto]
 *     summary: Define o cambia el modo (por área / por categoría) general de un año (requiere permiso "viewPresupuesto").
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [anio, modo]
 *             properties:
 *               anio: { type: integer }
 *               modo: { type: string, enum: [area, categoria] }
 *               confirm: { type: boolean, description: "Requerido en true si ya hay presupuestos configurados en otro modo (de lo contrario responde 409)." }
 *     responses:
 *       200:
 *         description: Modo definido o cambiado.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 anio: { type: integer }
 *                 modo: { type: string, enum: [area, categoria] }
 *                 cambiado: { type: boolean }
 *                 presupuestosBorrados: { type: integer }
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
 *       409:
 *         description: Ya hay presupuestos configurados en otro modo — requiere confirm=true para continuar (es destructivo, los borra).
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Error'
 *                 - type: object
 *                   properties: { requiresConfirm: { type: boolean }, afectados: { type: integer } }
 */
export async function POST(request) {
  const { user, denied } = await requirePermission("viewPresupuesto");
  if (denied) return denied;
  try {
    const body = await request.json();
    const result = await setModoAnio(body, user);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err.message, requiresConfirm: err.requiresConfirm || false, afectados: err.afectados },
      { status: err.status || 500 }
    );
  }
}
