import { conTesoreria } from "@/lib/tesoreria/ruta";
import { asociarPago } from "@/lib/tesoreria/asociaciones";
import { getPago } from "@/lib/tesoreria/pagos";

/**
 * @openapi
 * /api/tesoreria/pagos/{id}/asociaciones:
 *   put:
 *     tags: [Tesorería]
 *     summary: "Asociar desde el pago: { asociaciones: [{ movimientoId, valor }] } deja así los movimientos de este pago (nivel registro)."
 */
export const PUT = conTesoreria("registro", async ({ user, params, body }) => {
  await asociarPago(user, params.id, body?.asociaciones || []);
  return getPago(params.id);
});
