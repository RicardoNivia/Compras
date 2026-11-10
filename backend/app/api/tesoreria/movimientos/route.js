import { conTesoreria } from "@/lib/tesoreria/ruta";
import { listMovimientos, crearMovimiento, getMovimiento } from "@/lib/tesoreria/movimientos";

/**
 * @openapi
 * /api/tesoreria/movimientos:
 *   get:
 *     tags: [Tesorería]
 *     summary: "Libro de movimientos paginado (q, anio, mes, desde, hasta, cuentaId, itemId, conceptoId, pagadorId, tipo, estado: proyectado|ejecutado|conciliado|porConciliar|sinSoporte, page, size) con totales por moneda ISO 4217."
 *   post:
 *     tags: [Tesorería]
 *     summary: "Registra un movimiento a mano (nivel registro). Valor positivo; el tipo da el signo."
 */
export const GET = conTesoreria("consulta", ({ query }) => listMovimientos(query));
export const POST = conTesoreria("registro", async ({ user, body }) => getMovimiento((await crearMovimiento(user, body || {})).id));
