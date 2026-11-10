import { conTesoreria } from "@/lib/tesoreria/ruta";
import { enlazar } from "@/lib/tesoreria/conciliacion";

/**
 * @openapi
 * /api/tesoreria/conciliacion/enlazar:
 *   post:
 *     tags: [Tesorería]
 *     summary: "Enlaza una línea del extracto con un movimiento ({ lineaId, movimientoId }); un proyectado pasa a ejecutado y se aprende la regla. Nivel registro."
 */
export const POST = conTesoreria("registro", ({ user, body }) => enlazar(user, body || {}));
