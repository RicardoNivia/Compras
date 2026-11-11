import { conTesoreria } from "@/lib/tesoreria/ruta";
import { proponerPagos } from "@/lib/tesoreria/proponerPagos";

/**
 * @openapi
 * /api/tesoreria/pagos/proponer:
 *   post:
 *     tags: [Tesorería]
 *     summary: "Propone los pagos de un mes o del año ({ anio, mes? }): periodos que faltan de los gastos periódicos y lo del mismo mes del año anterior que Nova cree que se repite. No crea nada (nivel registro)."
 */
export const POST = conTesoreria("registro", ({ body = {} }) => proponerPagos({ anio: body.anio, mes: body.mes || null }));
