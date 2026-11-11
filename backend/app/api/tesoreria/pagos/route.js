import { conTesoreria } from "@/lib/tesoreria/ruta";
import { listPagos, crearPago, getPago } from "@/lib/tesoreria/pagos";

/**
 * @openapi
 * /api/tesoreria/pagos:
 *   get:
 *     tags: [Tesorería]
 *     summary: "Pagos programados (anio, mes, estado P|E, tipo, itemId, conceptoId, medioPagoId, pagadorId, gastoPeriodicoId, extraordinarios=1, vencidos=1, asociacion sin|con|diferencia|pagadoSinMovimiento, sentido egreso|ingreso, q, ids, page, size) con totales."
 *   post:
 *     tags: [Tesorería]
 *     summary: "Crea un pago extraordinario (nivel registro). valor positivo; sentido sale|entra solo para T."
 */
export const GET = conTesoreria("consulta", ({ query }) => listPagos(query));
export const POST = conTesoreria("registro", async ({ user, body }) => getPago((await crearPago(user, body || {})).id));
