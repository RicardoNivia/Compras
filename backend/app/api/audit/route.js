import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/apiGuard";
import { listAuditLogs } from "@/lib/audit";

/**
 * @openapi
 * /api/audit:
 *   get:
 *     tags: [Auditoría]
 *     summary: Historial de acciones sensibles, paginado y filtrable (requiere permiso "viewAuditoria").
 *     parameters:
 *       - { name: from, in: query, schema: { type: string, format: date }, description: "Fecha inicial (incluida)." }
 *       - { name: to, in: query, schema: { type: string, format: date }, description: "Fecha final (incluida)." }
 *       - { name: userId, in: query, schema: { type: string }, description: "Filtra por autor." }
 *       - { name: recordId, in: query, schema: { type: string }, description: "Filtra por entidad afectada." }
 *       - { name: action, in: query, schema: { type: string, enum: [crear, editar, eliminar, radicar, enviar, bloqueoIa] }, description: "Filtra por tipo de acción." }
 *       - { name: entityType, in: query, schema: { type: string, enum: [record, maestro, proveedor, user, presupuesto, permiso, informe, agente-ia] }, description: "Filtra por tipo de entidad afectada." }
 *       - { name: page, in: query, schema: { type: integer, default: 1 } }
 *       - { name: pageSize, in: query, schema: { type: integer, default: 50, maximum: 200 } }
 *     responses:
 *       200:
 *         description: Página de resultados.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total: { type: integer }
 *                 page: { type: integer }
 *                 pageSize: { type: integer }
 *                 logs:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: string }
 *                       action: { type: string }
 *                       entityType: { type: string }
 *                       recordId: { type: string, nullable: true }
 *                       recordInfo: { type: string, nullable: true }
 *                       userId: { type: string, nullable: true }
 *                       userNombre: { type: string, nullable: true }
 *                       userEmail: { type: string, nullable: true }
 *                       changes: { type: array, nullable: true, items: { type: object } }
 *                       createdAt: { type: string, format: date-time }
 *       403:
 *         description: No autorizado.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
export async function GET(request) {
  const { denied } = await requirePermission("viewAuditoria");
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") || undefined;
  const to = searchParams.get("to") || undefined;
  const userId = searchParams.get("userId") || undefined;
  const recordId = searchParams.get("recordId") || undefined;
  const action = searchParams.get("action") || undefined;
  const entityType = searchParams.get("entityType") || undefined;
  const page = parseInt(searchParams.get("page") || "1", 10) || 1;
  const pageSize = Math.min(200, parseInt(searchParams.get("pageSize") || "50", 10) || 50);

  const result = await listAuditLogs({ from, to, userId, recordId, action, entityType, page, pageSize });
  return NextResponse.json(result);
}
