import { conTesoreria } from "@/lib/tesoreria/ruta";
import { getMovimiento, editarMovimiento, borrarMovimiento } from "@/lib/tesoreria/movimientos";

/**
 * @openapi
 * /api/tesoreria/movimientos/{id}:
 *   get:
 *     tags: [Tesorería]
 *     summary: "Un movimiento con sus soportes y las líneas del extracto enlazadas."
 *   patch:
 *     tags: [Tesorería]
 *     summary: "Edita el movimiento (nivel registro; no en un mes firmado; si está conciliado no cambia valor, cuenta ni tipo)."
 *   delete:
 *     tags: [Tesorería]
 *     summary: "Borra el movimiento (nivel registro; no conciliado ni en un mes firmado)."
 */
export const GET = conTesoreria("consulta", ({ params }) => getMovimiento(params.id));
export const PATCH = conTesoreria("registro", async ({ user, params, body }) => getMovimiento((await editarMovimiento(user, params.id, body || {})).id));
export const DELETE = conTesoreria("registro", ({ user, params }) => borrarMovimiento(user, params.id));
