import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/apiGuard";
import { listAuditActors } from "@/lib/audit";

/**
 * @openapi
 * /api/audit/actors:
 *   get:
 *     tags: [Auditoría]
 *     summary: Autores distintos que aparecen en el log (incluye usuarios ya eliminados), para el filtro por usuario (requiere permiso "viewAuditoria").
 *     responses:
 *       200:
 *         description: Autores.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 actors:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: string, nullable: true }
 *                       nombre: { type: string, nullable: true }
 *                       email: { type: string, nullable: true }
 *       403:
 *         description: No autorizado.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
export async function GET() {
  const { denied } = await requirePermission("viewAuditoria");
  if (denied) return denied;

  const actors = await listAuditActors();
  return NextResponse.json({ actors });
}
