import { conTesoreria } from "@/lib/tesoreria/ruta";
import { resolverPendiente } from "@/lib/tesoreria/conciliacion";

/**
 * @openapi
 * /api/tesoreria/conciliacion/pendiente:
 *   post:
 *     tags: [Tesorería]
 *     summary: "Aprueba una línea del extracto que no está registrada: { extractoId, clave, accion: registrar | descartar } (nivel registro)."
 */
export const POST = conTesoreria("registro", ({ user, body }) => resolverPendiente(user, body || {}));
