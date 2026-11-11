import { conTesoreria } from "@/lib/tesoreria/ruta";
import { editarMaestro, borrarMaestro } from "@/lib/tesoreria/maestros";

/**
 * @openapi
 * /api/tesoreria/maestros/{tipo}/{id}:
 *   patch:
 *     tags: [Tesorería]
 *     summary: "Edita o activa/desactiva un valor del catálogo. Nivel firma."
 *   delete:
 *     tags: [Tesorería]
 *     summary: "Borra un valor que ningún movimiento usa. Nivel firma."
 */
export const PATCH = conTesoreria("firma", ({ user, params, body }) => editarMaestro(user, params.tipo, params.id, body || {}));
export const DELETE = conTesoreria("firma", ({ user, params }) => borrarMaestro(user, params.tipo, params.id));
