import { NextResponse } from "next/server";
import { requirePermission, apiError } from "@/lib/apiGuard";
import { prisma } from "@/lib/prisma";

/**
 * @openapi
 * /api/reports/usuarios:
 *   get:
 *     tags: [Informes]
 *     summary: Usuarios activos (id, nombre, correo y rol) para dar acceso a un informe solo para consultar (requiere permiso viewReportes).
 *     responses:
 *       200:
 *         description: Usuarios.
 *         content:
 *           application/json:
 *             schema: { type: object, properties: { usuarios: { type: array, items: { type: object } } } }
 */
export async function GET() {
  const { denied } = await requirePermission("viewReportes");
  if (denied) return denied;
  try {
    const usuarios = await prisma.user.findMany({ where: { activo: true }, select: { id: true, nombre: true, email: true, role: true }, orderBy: { nombre: "asc" } });
    return NextResponse.json({ usuarios });
  } catch (err) {
    return apiError(err);
  }
}
