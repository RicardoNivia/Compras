import { conConsumo } from "@/lib/consumo/ruta";
import { editarMaestro, borrarMaestro } from "@/lib/consumo/maestros";

/**
 * @openapi
 * /api/consumo/maestros/{tipo}/{id}:
 *   patch:
 *     tags: [Consumo]
 *     summary: "Edita una sede, empresa o cuenta de servicio de Consumo."
 *   delete:
 *     tags: [Consumo]
 *     summary: "Elimina una sede, empresa o cuenta de Consumo que no tenga recibos (si los tiene, se desactiva)."
 */
export const PATCH = conConsumo("admin", ({ user, params, body }) => editarMaestro(user, params.tipo, params.id, body || {}));
export const DELETE = conConsumo("admin", ({ user, params }) => borrarMaestro(user, params.tipo, params.id));
