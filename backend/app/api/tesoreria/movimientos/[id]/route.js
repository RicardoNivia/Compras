import { conTesoreria } from "@/lib/tesoreria/ruta";
import { getMovimiento, editarMovimiento, borrarMovimiento } from "@/lib/tesoreria/movimientos";

/**
 * @openapi
 * /api/tesoreria/movimientos/{id}:
 *   get:
 *     tags: [Tesorería]
 *     summary: "Un movimiento con sus soportes y los pagos a los que está asociado."
 *   patch:
 *     tags: [Tesorería]
 *     summary: "Edita el movimiento (nivel registro). asociaciones opcional: la lista completa [{ pagoId, valor }]."
 *   delete:
 *     tags: [Tesorería]
 *     summary: "Borra el movimiento y sus asociaciones; los pagos que quedan sin movimientos vuelven a P (nivel registro)."
 */
export const GET = conTesoreria("consulta", ({ params }) => getMovimiento(params.id));
export const PATCH = conTesoreria("registro", async ({ user, params, body }) => getMovimiento((await editarMovimiento(user, params.id, body || {})).id));
export const DELETE = conTesoreria("registro", ({ user, params }) => borrarMovimiento(user, params.id));
