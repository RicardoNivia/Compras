import { conTesoreria } from "@/lib/tesoreria/ruta";
import { resolverAlertas } from "@/lib/tesoreria/alertas";

/**
 * @openapi
 * /api/tesoreria/alertas/revisar:
 *   post:
 *     tags: [Tesorería]
 *     summary: "Marca alertas como revisadas ({ ids, revisada: true|false }) (nivel registro)."
 */
export const POST = conTesoreria("registro", ({ user, body = {} }) => resolverAlertas(user, body.ids, body.revisada !== false));
