import { NextResponse } from "next/server";
import { getFullMatrix, setPermission } from "@/lib/permissions";
import { todosLosRoles } from "@/lib/rolesCatalogo";
import { requirePermission, apiError } from "@/lib/apiGuard";

// La propia Matriz de permisos se administra desde la sección Usuarios, así
// que se gatea con la misma funcionalidad "viewUsuarios" (dinámica, no un
// role === "admin" fijo) para quedar consistente con el resto de la matriz.
/**
 * @openapi
 * /api/permissions:
 *   get:
 *     tags: [Permisos]
 *     summary: Matriz completa de permisos por rol y funcionalidad (requiere permiso "viewUsuarios").
 *     responses:
 *       200:
 *         description: Matriz de permisos.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 matrix:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       key: { type: string }
 *                       label: { type: string }
 *                       section: { type: string }
 *                       roles: { type: object, additionalProperties: { type: boolean } }
 *       403:
 *         description: No autorizado.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
export async function GET() {
  const { denied } = await requirePermission("viewUsuarios");
  if (denied) return denied;
  const [matrix, roles] = await Promise.all([getFullMatrix(), todosLosRoles()]);
  return NextResponse.json({ matrix, roles: roles.map(({ clave, nombre, sistema }) => ({ clave, nombre, sistema })) });
}

/**
 * @openapi
 * /api/permissions:
 *   post:
 *     tags: [Permisos]
 *     summary: Cambia el permiso de un rol sobre una funcionalidad (requiere permiso "viewUsuarios"; no se puede modificar el rol admin).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [role, feature, allowed]
 *             properties:
 *               role: { type: string, enum: [registro, legalizar, radicar] }
 *               feature: { type: string }
 *               allowed: { type: boolean }
 *     responses:
 *       200:
 *         description: Permiso guardado.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 role: { type: string }
 *                 feature: { type: string }
 *                 allowed: { type: boolean }
 *       400:
 *         description: Rol o funcionalidad inválidos.
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
  const { user, denied } = await requirePermission("viewUsuarios");
  if (denied) return denied;
  try {
    const body = await request.json();
    const row = await setPermission(body, user);
    return NextResponse.json(row);
  } catch (err) {
    return apiError(err);
  }
}
