import { NextResponse } from "next/server";
import { listUsers, createUser } from "@/lib/users";
import { requirePermission, apiError } from "@/lib/apiGuard";

// Gestión de usuarios: restringida por la funcionalidad "viewUsuarios" de la
// Matriz de permisos (por defecto, solo admin) — antes gateado a nivel de
// middleware.js con un rol fijo, ahora aquí para poder consultar la BD.

/**
 * @openapi
 * /api/users:
 *   get:
 *     tags: [Usuarios]
 *     summary: Lista las cuentas de usuario (requiere permiso "viewUsuarios", por defecto solo admin).
 *     responses:
 *       200:
 *         description: Usuarios.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties: { users: { type: array, items: { $ref: '#/components/schemas/User' } } }
 *       403:
 *         description: No autorizado.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
export async function GET() {
  const { denied } = await requirePermission("viewUsuarios");
  if (denied) return denied;
  const users = await listUsers();
  return NextResponse.json({ users });
}

/**
 * @openapi
 * /api/users:
 *   post:
 *     tags: [Usuarios]
 *     summary: Crea una cuenta de usuario (requiere permiso "viewUsuarios"; la contraseña se hashea con bcrypt).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             allOf:
 *               - $ref: '#/components/schemas/User'
 *               - type: object
 *                 properties: { password: { type: string, format: password } }
 *     responses:
 *       201:
 *         description: Usuario creado.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/User' }
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
 */
export async function POST(request) {
  const { user: actor, denied } = await requirePermission("viewUsuarios");
  if (denied) return denied;
  try {
    const body = await request.json();
    const user = await createUser(body, actor);
    return NextResponse.json(user, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
