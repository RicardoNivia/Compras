import { conTesoreria } from "@/lib/tesoreria/ruta";
import { verificarMovimiento } from "@/lib/tesoreria/conciliacion";

/**
 * @openapi
 * /api/tesoreria/conciliacion/verificar:
 *   post:
 *     tags: [Tesorería]
 *     summary: "Marca un movimiento registrado a mano como confirmado por el banco ({ movimientoId, verificado }) (nivel registro)."
 */
export const POST = conTesoreria("registro", ({ user, body = {} }) => verificarMovimiento(user, body.movimientoId, body.verificado !== false));
