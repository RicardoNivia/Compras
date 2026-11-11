import { conTesoreria } from "@/lib/tesoreria/ruta";
import { listPropuestas } from "@/lib/tesoreria/agenteAsociacion";

/**
 * @openapi
 * /api/tesoreria/agente:
 *   get:
 *     tags: [Tesorería]
 *     summary: "Propuestas pendientes del agente de asociación (confianza alta|media|baja, bancoId, page, size)."
 */
export const GET = conTesoreria("consulta", ({ query }) => listPropuestas(query));
