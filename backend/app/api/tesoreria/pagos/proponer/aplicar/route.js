import { conTesoreria } from "@/lib/tesoreria/ruta";
import { aplicarPropuestas } from "@/lib/tesoreria/proponerPagos";

/**
 * @openapi
 * /api/tesoreria/pagos/proponer/aplicar:
 *   post:
 *     tags: [Tesorería]
 *     summary: "Crea en P los pagos propuestos que la persona aprobó ({ items }) (nivel registro)."
 */
export const POST = conTesoreria("registro", ({ user, body = {} }) => aplicarPropuestas(user, body.items));
