import { conTesoreria } from "@/lib/tesoreria/ruta";
import { firmarCierre } from "@/lib/tesoreria/cierre";

/**
 * @openapi
 * /api/tesoreria/cierre/firmar:
 *   post:
 *     tags: [Tesorería]
 *     summary: "Firma el cierre del mes ({ anio, mes }): queda de solo lectura con los saldos por cuenta. Nivel firma."
 */
export const POST = conTesoreria("firma", ({ user, body }) => firmarCierre(user, body?.anio, body?.mes));
