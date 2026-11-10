import { conTesoreria } from "@/lib/tesoreria/ruta";
import { crearDesdeLinea } from "@/lib/tesoreria/conciliacion";
import { getMovimiento } from "@/lib/tesoreria/movimientos";

/**
 * @openapi
 * /api/tesoreria/conciliacion/crear:
 *   post:
 *     tags: [Tesorería]
 *     summary: "Crea el movimiento de una línea que solo está en el banco y la enlaza ({ lineaId, conceptoId, itemId, pagadorId, tipo, cuentaDestinoId }). Nivel registro."
 */
export const POST = conTesoreria("registro", async ({ user, body }) => getMovimiento((await crearDesdeLinea(user, body?.lineaId, body || {})).id));
