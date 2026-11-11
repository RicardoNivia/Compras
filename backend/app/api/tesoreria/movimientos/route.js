import { conTesoreria } from "@/lib/tesoreria/ruta";
import { listMovimientos, crearMovimiento, getMovimiento } from "@/lib/tesoreria/movimientos";

/**
 * @openapi
 * /api/tesoreria/movimientos:
 *   get:
 *     tags: [Tesorería]
 *     summary: "Movimientos de los bancos paginados (q, anio, mes, bancoId, tipo debito|credito, asociacion sin|con|parcial|porAsignar, origen, ids, page, size) con totales."
 *   post:
 *     tags: [Tesorería]
 *     summary: "Registra un movimiento (nivel registro). Valor positivo; el tipo da el signo. asociaciones opcional: [{ pagoId, valor }]."
 */
export const GET = conTesoreria("consulta", ({ query }) => listMovimientos(query));
export const POST = conTesoreria("registro", async ({ user, body }) => {
  const m = await crearMovimiento(user, body || {});
  return { ...(await getMovimiento(m.id)), avisoAsociacion: m.avisoAsociacion || null };
});
