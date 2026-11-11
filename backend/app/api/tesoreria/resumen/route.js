import { conTesoreria } from "@/lib/tesoreria/ruta";
import { resumenTesoreria } from "@/lib/tesoreria/resumen";

/**
 * @openapi
 * /api/tesoreria/resumen:
 *   get:
 *     tags: [Tesorería]
 *     summary: "Flujo de caja del año (o de un mes): ingresos, egresos y neto ejecutados y proyectados por mes, por ítem y por moneda ISO 4217, saldos por cuenta y próximos pagos."
 */
export const GET = conTesoreria("consulta", ({ query }) => resumenTesoreria({ anio: query.anio, mes: query.mes }));
