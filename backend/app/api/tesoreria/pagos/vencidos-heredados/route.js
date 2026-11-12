import { conTesoreria } from "@/lib/tesoreria/ruta";
import { vistaVencidosHeredados, marcarPagadosEnBloque } from "@/lib/tesoreria/porResolver";

/**
 * @openapi
 * /api/tesoreria/pagos/vencidos-heredados:
 *   get:
 *     tags: [Tesorería]
 *     summary: "Pendientes con vencimiento anterior a ?hasta (por defecto el primer día del mes pasado), para limpiarlos."
 *   post:
 *     tags: [Tesorería]
 *     summary: "Marca en bloque como pagados los pagos elegidos ({ ids, motivo }), sin avisos por cada uno; una entrada de auditoría (nivel registro)."
 */
export const GET = conTesoreria("consulta", ({ query }) => vistaVencidosHeredados(query));
export const POST = conTesoreria("registro", ({ user, body }) => marcarPagadosEnBloque(user, body || {}));
