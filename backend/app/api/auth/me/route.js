import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-server";
import { getEffectivePermissions } from "@/lib/permissions";
import { nombreDeRol } from "@/lib/rolesCatalogo";
import { accesoDe } from "@/lib/tesoreria/comun";
import { puedeAdministrarAccesos } from "@/lib/tesoreria/accesos";

/**
 * @openapi
 * /api/auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Usuario de la sesión actual, con su mapa de permisos efectivos.
 *     responses:
 *       200:
 *         description: Usuario autenticado.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   allOf:
 *                     - $ref: '#/components/schemas/User'
 *                     - type: object
 *                       properties:
 *                         permissions: { type: object, additionalProperties: { type: boolean } }
 *       401:
 *         description: No autenticado.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  // Se entrega junto con el usuario para que el frontend (páginas server y
  // Sidebar) pueda reflejar la Matriz de permisos sin tener que consultar la
  // base de datos directamente — solo lee vía HTTP, igual que el resto.
  // roleLabel: nombre del rol para mostrar (los personalizados no están en lib/roles.js del frontend).
  // tesoreria: acceso nominal a Tesorería (null si no tiene); no es un permiso de la Matriz.
  const [permissions, roleLabel, tesoreria] = await Promise.all([getEffectivePermissions(user.role), nombreDeRol(user.role), accesoDe(user.id)]);
  // tesoreriaArranque: nadie tiene acceso todavía y esta persona (admin) puede dar el primero.
  const tesoreriaArranque = !tesoreria && (await puedeAdministrarAccesos(user));
  return NextResponse.json({ user: { ...user, roleLabel, permissions, tesoreria, tesoreriaArranque } });
}
