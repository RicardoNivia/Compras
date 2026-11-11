import { conTesoreria } from "@/lib/tesoreria/ruta";
import { detalleBanco } from "@/lib/tesoreria/conciliacion";

/**
 * @openapi
 * /api/tesoreria/conciliacion/banco:
 *   get:
 *     tags: [Tesorería]
 *     summary: "Conciliación de un banco en un mes (bancoId, anio, mes): el cuadre del saldo, los movimientos por verificar y los que no tienen pago (con la propuesta del agente)."
 */
export const GET = conTesoreria("consulta", ({ query }) => detalleBanco({ bancoId: query.bancoId, anio: query.anio, mes: query.mes }));
