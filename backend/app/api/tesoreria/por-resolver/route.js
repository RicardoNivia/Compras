import { conTesoreria } from "@/lib/tesoreria/ruta";
import { porResolver } from "@/lib/tesoreria/porResolver";

/**
 * @openapi
 * /api/tesoreria/por-resolver:
 *   get:
 *     tags: [Tesorería]
 *     summary: "Lo pendiente del operador: extractos que faltan, líneas sin aprobar, movimientos sin pago, propuestas, pagos con diferencia, pagos sin soporte y vencidos heredados."
 */
export const GET = conTesoreria("consulta", () => porResolver());
