import { conTesoreria } from "@/lib/tesoreria/ruta";
import { estadoCierre } from "@/lib/tesoreria/cierre";

/**
 * @openapi
 * /api/tesoreria/cierre:
 *   get:
 *     tags: [Tesorería]
 *     summary: "Lista del cierre de un mes (anio, mes): soportes, conciliación por cuenta, proyectados vencidos, si se puede firmar y la firma."
 */
export const GET = conTesoreria("consulta", ({ query }) => estadoCierre(query.anio, query.mes));
