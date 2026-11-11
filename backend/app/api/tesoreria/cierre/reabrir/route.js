import { conTesoreria } from "@/lib/tesoreria/ruta";
import { reabrirCierre } from "@/lib/tesoreria/conciliacion";

/**
 * @openapi
 * /api/tesoreria/cierre/reabrir:
 *   post:
 *     tags: [Tesorería]
 *     summary: "Reabre un mes cerrado { anio, mes } (queda en auditoría). Nivel firma."
 */
export const POST = conTesoreria("firma", ({ user, body = {} }) => reabrirCierre(user, body));
