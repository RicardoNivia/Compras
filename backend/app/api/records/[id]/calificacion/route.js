import { NextResponse } from "next/server";
import { getCalificacionByRecordId, upsertCalificacion } from "@/lib/calificaciones";
import { requirePermission, apiError } from "@/lib/apiGuard";

/**
 * @openapi
 * /api/records/{id}/calificacion:
 *   get:
 *     tags: [Registros]
 *     summary: Obtiene la calificación del proveedor para un registro (requiere permiso "editRecord").
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Calificación (o null si aún no se ha calificado).
 *       403:
 *         description: No autorizado.
 */
export async function GET(_request, { params }) {
  const { denied } = await requirePermission("editRecord");
  if (denied) return denied;
  try {
    const calificacion = await getCalificacionByRecordId(params.id);
    return NextResponse.json({ calificacion });
  } catch (err) {
    return apiError(err);
  }
}

/**
 * @openapi
 * /api/records/{id}/calificacion:
 *   put:
 *     tags: [Registros]
 *     summary: Crea o edita la calificación del proveedor de un registro (1 a 5 estrellas; causasIds obligatorio si estrellas < 5). Requiere permiso "editRecord".
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [estrellas]
 *             properties:
 *               estrellas: { type: integer, minimum: 1, maximum: 5 }
 *               causasIds: { type: array, items: { type: string } }
 *               comentario: { type: string }
 *     responses:
 *       200:
 *         description: Calificación guardada.
 *       400:
 *         description: Datos inválidos.
 *       403:
 *         description: No autorizado.
 */
export async function PUT(request, { params }) {
  const { user, denied } = await requirePermission("editRecord");
  if (denied) return denied;
  try {
    const body = await request.json();
    const calificacion = await upsertCalificacion(params.id, body, user);
    return NextResponse.json({ calificacion });
  } catch (err) {
    return apiError(err);
  }
}
