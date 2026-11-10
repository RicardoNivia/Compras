import { conTesoreria } from "@/lib/tesoreria/ruta";
import { ignorarLinea } from "@/lib/tesoreria/conciliacion";

/**
 * @openapi
 * /api/tesoreria/conciliacion/ignorar:
 *   post:
 *     tags: [Tesorería]
 *     summary: "Marca una línea del extracto como no-movimiento o la vuelve a pendiente ({ lineaId, ignorar }). Nivel registro."
 */
export const POST = conTesoreria("registro", ({ user, body }) => ignorarLinea(user, body?.lineaId, body?.ignorar));
