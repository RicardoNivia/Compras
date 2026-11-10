import { conTesoreria } from "@/lib/tesoreria/ruta";
import { estadoConciliacion } from "@/lib/tesoreria/conciliacion";

/**
 * @openapi
 * /api/tesoreria/conciliacion:
 *   get:
 *     tags: [Tesorería]
 *     summary: "Conciliación de una cuenta en un mes (cuentaId, anio, mes): neto según banco y según libro, diferencia, enlazadas, sugerencias, solo en el banco (con la regla aprendida) y solo en el libro."
 */
export const GET = conTesoreria("consulta", ({ query }) => estadoConciliacion(Number(query.cuentaId), Number(query.anio), Number(query.mes)));
