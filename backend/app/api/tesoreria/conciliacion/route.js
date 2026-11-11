import { conTesoreria } from "@/lib/tesoreria/ruta";
import { estadoMes } from "@/lib/tesoreria/conciliacion";

/**
 * @openapi
 * /api/tesoreria/conciliacion:
 *   get:
 *     tags: [Tesorería]
 *     summary: "Conciliación de un mes (anio, mes): cada banco con su saldo calculado contra el del banco, lo que falta verificar y asociar, y si el mes se puede cerrar."
 */
export const GET = conTesoreria("consulta", ({ query }) => estadoMes({ anio: query.anio, mes: query.mes }));
