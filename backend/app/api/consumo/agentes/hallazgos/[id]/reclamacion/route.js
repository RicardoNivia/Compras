import { conConsumo } from "@/lib/consumo/ruta";
import { generarReclamacion, actualizarReclamacion } from "@/lib/consumo/reclamaciones";

/**
 * @openapi
 * /api/consumo/agentes/hallazgos/{id}/reclamacion:
 *   post:
 *     tags: [Consumo]
 *     summary: "Nova redacta (o vuelve a redactar) el borrador de la reclamación del hallazgo. No envía nada."
 *   patch:
 *     tags: [Consumo]
 *     summary: "{ accion: guardar (asunto, destinatario, cuerpo, anexos) | radicar (numero, fecha) | borrador | quitar }."
 */
export const POST = conConsumo("registro", ({ user, params }) => generarReclamacion(user, params.id));
export const PATCH = conConsumo("registro", ({ user, params, body }) => actualizarReclamacion(user, params.id, body || {}));
