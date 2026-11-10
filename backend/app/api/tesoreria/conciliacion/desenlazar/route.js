import { conTesoreria } from "@/lib/tesoreria/ruta";
import { desenlazar } from "@/lib/tesoreria/conciliacion";

/**
 * @openapi
 * /api/tesoreria/conciliacion/desenlazar:
 *   post:
 *     tags: [Tesorería]
 *     summary: "Quita el enlace de una línea del extracto ({ lineaId }). Nivel registro."
 */
export const POST = conTesoreria("registro", ({ user, body }) => desenlazar(user, body?.lineaId));
