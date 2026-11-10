import { NextResponse } from "next/server";
import { requirePermission, apiError } from "@/lib/apiGuard";
import { updateRol, deleteRol } from "@/lib/rolesPersonalizados";

/**
 * @openapi
 * /api/roles/{clave}:
 *   put:
 *     tags: [Usuarios]
 *     summary: Cambia nombre y descripción (solo personalizados) y/o la lista completa de funcionalidades (cualquier rol menos Administrador).
 *     responses:
 *       200: { description: "{ rol }" }
 *   delete:
 *     tags: [Usuarios]
 *     summary: Elimina un rol personalizado que ningún usuario tenga (si lo tienen, 409).
 *     responses:
 *       200: { description: "{ ok: true }" }
 *       409: { description: Hay usuarios con ese rol. }
 */
export async function PUT(request, { params }) {
  const { user, denied } = await requirePermission("viewUsuarios");
  if (denied) return denied;
  try {
    return NextResponse.json({ rol: await updateRol(params.clave, await request.json(), user) });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(_request, { params }) {
  const { user, denied } = await requirePermission("viewUsuarios");
  if (denied) return denied;
  try {
    await deleteRol(params.clave, user);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
