import { conTesoreria } from "@/lib/tesoreria/ruta";
import { crearMaestro } from "@/lib/tesoreria/maestros";

/**
 * @openapi
 * /api/tesoreria/maestros/{tipo}:
 *   post:
 *     tags: [Tesorería]
 *     summary: "Crea un valor del catálogo (tipo: cuenta | item | concepto | pagador). Nivel firma."
 */
export const POST = conTesoreria("firma", ({ user, params, body }) => crearMaestro(user, params.tipo, body || {}));
