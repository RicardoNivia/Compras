import { NextResponse } from "next/server";
import { requirePermission, apiError } from "@/lib/apiGuard";
import { listRoles, createRol } from "@/lib/rolesPersonalizados";

// Roles y sus funcionalidades se administran desde Usuarios, con la misma funcionalidad "viewUsuarios" que la Matriz.
/**
 * @openapi
 * /api/roles:
 *   get:
 *     tags: [Usuarios]
 *     summary: Roles del sistema y personalizados, con sus funcionalidades efectivas y cuántos usuarios los tienen.
 *     responses:
 *       200: { description: "{ roles: [{ clave, nombre, descripcion, sistema, usuarios, funcionalidades: string[] }] }" }
 *   post:
 *     tags: [Usuarios]
 *     summary: Crea un rol personalizado ({ nombre, descripcion, funcionalidades }). Sin funcionalidades, no tiene ningún permiso.
 *     responses:
 *       201: { description: Rol creado. }
 *       400: { description: Nombre repetido o funcionalidad inválida. }
 */
export async function GET() {
  const { denied } = await requirePermission("viewUsuarios");
  if (denied) return denied;
  try {
    return NextResponse.json({ roles: await listRoles() });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(request) {
  const { user, denied } = await requirePermission("viewUsuarios");
  if (denied) return denied;
  try {
    return NextResponse.json(await createRol(await request.json(), user), { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
