import { conTesoreria } from "@/lib/tesoreria/ruta";
import { firmarCierre } from "@/lib/tesoreria/conciliacion";

/**
 * @openapi
 * /api/tesoreria/cierre/firmar:
 *   post:
 *     tags: [Tesorería]
 *     summary: "Cierra (firma) el mes { anio, mes } si todos los bancos cuadran con el banco. Nivel firma."
 */
export const POST = conTesoreria("firma", ({ user, body = {} }) => firmarCierre(user, body));
