import { conTesoreria } from "@/lib/tesoreria/ruta";
import { listGastos, crearGasto } from "@/lib/tesoreria/periodicos";

/**
 * @openapi
 * /api/tesoreria/periodicos:
 *   get:
 *     tags: [Tesorería]
 *     summary: "Gastos periódicos (anio: solo los vigentes ese año, con sus pendientes, pagados y próximo pago de ese año) y los años que tienen pagos."
 *   post:
 *     tags: [Tesorería]
 *     summary: "Crea un gasto periódico y genera sus pagos en P desde el mes en curso hasta su fin o diciembre (nivel registro)."
 */
export const GET = conTesoreria("consulta", ({ query }) => listGastos({ anio: query.anio }));
export const POST = conTesoreria("registro", ({ user, body }) => crearGasto(user, body || {}));
