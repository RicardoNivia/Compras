import { conTesoreria } from "@/lib/tesoreria/ruta";
import { getPago, editarPago, borrarPago } from "@/lib/tesoreria/pagos";

/**
 * @openapi
 * /api/tesoreria/pagos/{id}:
 *   get:
 *     tags: [Tesorería]
 *     summary: "Un pago programado con los movimientos asociados y la diferencia."
 *   patch:
 *     tags: [Tesorería]
 *     summary: "Edita el pago, incluido el estado P/E a mano (nivel registro). No pasa a P si tiene movimientos."
 *   delete:
 *     tags: [Tesorería]
 *     summary: "Borra el pago (nivel registro; no si tiene movimientos)."
 */
export const GET = conTesoreria("consulta", ({ params }) => getPago(params.id));
export const PATCH = conTesoreria("registro", async ({ user, params, body }) => getPago((await editarPago(user, params.id, body || {})).id));
export const DELETE = conTesoreria("registro", ({ user, params }) => borrarPago(user, params.id));
