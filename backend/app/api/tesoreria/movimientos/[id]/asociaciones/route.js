import { conTesoreria } from "@/lib/tesoreria/ruta";
import { asociarMovimiento } from "@/lib/tesoreria/asociaciones";
import { getMovimiento } from "@/lib/tesoreria/movimientos";

/**
 * @openapi
 * /api/tesoreria/movimientos/{id}/asociaciones:
 *   put:
 *     tags: [Tesorería]
 *     summary: "Deja las asociaciones del movimiento como { asociaciones: [{ pagoId, valor }] } (nivel registro). Los pagos con movimientos pasan a E."
 */
export const PUT = conTesoreria("registro", async ({ user, params, body }) => {
  await asociarMovimiento(user, params.id, body?.asociaciones || []);
  return getMovimiento(params.id);
});
