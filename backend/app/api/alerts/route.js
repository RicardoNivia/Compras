import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/apiGuard";
import { getAlertsData } from "@/lib/alerts";

/**
 * @openapi
 * /api/alerts:
 *   get:
 *     tags: [Alertas]
 *     summary: Solicitudes atrasadas, riesgo de presupuesto y de tiempos, y compras legalizadas sin radicar (requiere permiso "viewAlertas").
 *     responses:
 *       200:
 *         description: Datos de alertas.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 solicitudesPendientes:
 *                   type: array
 *                   items: { type: object, description: "Registro resumido + diasHabiles + vencido." }
 *                 riesgoPresupuesto:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       area: { type: string }
 *                       anio: { type: integer }
 *                       presupuestado: { type: number }
 *                       gastado: { type: number }
 *                       porcentaje: { type: number, nullable: true }
 *                       estado: { type: string, enum: [sin-datos, ok, alerta, excedido] }
 *                 riesgoTiempos:
 *                   type: array
 *                   items: { type: object, description: "Registro resumido + diasHabiles + entregado." }
 *                 noRadicadas:
 *                   type: array
 *                   items: { type: object, description: "Registro resumido, legalizado y aún no radicado." }
 *       403:
 *         description: No autorizado.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
export async function GET() {
  const { denied } = await requirePermission("viewAlertas");
  if (denied) return denied;
  const data = await getAlertsData();
  return NextResponse.json(data);
}
