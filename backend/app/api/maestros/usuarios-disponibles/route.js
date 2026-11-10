import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAlgunPermiso, apiError } from "@/lib/apiGuard";

// Lista mínima de usuarios de la aplicación (id + nombre) para el picker del
// maestro "Responsable" (ver MaestroModal.jsx) — gateado por "viewMaestros" y
// no por "viewUsuarios", porque quien administra Maestros no necesariamente
// administra Usuarios. Expone solo lo imprescindible para armar el <select>,
// nunca el correo/rol/contraseña (eso sigue detrás de /api/users).
/**
 * @openapi
 * /api/maestros/usuarios-disponibles:
 *   get:
 *     tags: [Maestros]
 *     summary: Lista mínima de usuarios activos (id + nombre) para asignarlos como "Responsable" (requiere permiso "viewMaestros").
 *     responses:
 *       200:
 *         description: Usuarios disponibles.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 usuarios:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: string }
 *                       nombre: { type: string }
 *       403:
 *         description: No autorizado.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
export async function GET() {
  const { denied } = await requireAlgunPermiso(["viewMaestros", "viewMaestrosBienestar"]);
  if (denied) return denied;
  try {
    const usuarios = await prisma.user.findMany({
      where: { activo: true },
      select: { id: true, nombre: true },
      orderBy: { nombre: "asc" },
    });
    return NextResponse.json({ usuarios });
  } catch (err) {
    return apiError(err);
  }
}
