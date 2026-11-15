import { conConsumo } from "@/lib/consumo/ruta";
import { marcarPago } from "@/lib/consumo/recibos";

/**
 * @openapi
 * /api/consumo/recibos/{id}/pago:
 *   post:
 *     tags: [Consumo]
 *     summary: "Marca el pago de un recibo: estadoPago (pagado | pendiente | saldo_favor), valorPagado y fechaPago."
 */
export const POST = conConsumo("registro", ({ user, params, body }) => marcarPago(user, params.id, body || {}));
