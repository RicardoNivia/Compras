import { conTesoreria } from "@/lib/tesoreria/ruta";
import { listAlertas } from "@/lib/tesoreria/alertas";

/**
 * @openapi
 * /api/tesoreria/alertas:
 *   get:
 *     tags: [Tesorería]
 *     summary: "Alertas de Tesorería (resueltas=1 para las revisadas; tipo; page, size)."
 */
export const GET = conTesoreria("consulta", ({ query }) => listAlertas({ resueltas: query.resueltas === "1", tipo: query.tipo, page: query.page, size: query.size }));
