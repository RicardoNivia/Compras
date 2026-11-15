import { conConsumo } from "@/lib/consumo/ruta";
import { obtenerRecibo, editarRecibo, borrarRecibo } from "@/lib/consumo/recibos";

/**
 * @openapi
 * /api/consumo/recibos/{id}:
 *   get:
 *     tags: [Consumo]
 *     summary: "Un recibo con sus cargos, soportes, datos extra y lo calculado."
 *   patch:
 *     tags: [Consumo]
 *     summary: "Edita un recibo (los cargos, si vienen, reemplazan a los anteriores)."
 *   delete:
 *     tags: [Consumo]
 *     summary: "Elimina un recibo con sus cargos y soportes (solo quien administra Consumo)."
 */
export const GET = conConsumo("consulta", ({ params }) => obtenerRecibo(params.id));
export const PATCH = conConsumo("registro", ({ user, params, body }) => editarRecibo(user, params.id, body || {}));
export const DELETE = conConsumo("admin", ({ user, params }) => borrarRecibo(user, params.id));
