import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-server";
import { isRoleAllowed } from "@/lib/permissions";
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
  const user = await getSessionUser();
  if (!user || !(await isRoleAllowed(user.role, "viewAuditoria"))) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const actors = await listAuditActors();
  return NextResponse.json({ actors });
}
