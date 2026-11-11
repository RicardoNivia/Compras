import { conTesoreria } from "@/lib/tesoreria/ruta";
import { iniciarAnalisis, verAnalisis } from "@/lib/tesoreria/agenteConciliacion";

/**
 * @openapi
 * /api/tesoreria/conciliacion/agente:
 *   post:
 *     tags: [Tesorería]
 *     summary: "Corre el agente de conciliación ({ cuentaId, anio, mes }): enlaza lo exacto y Nova propone una decisión por cada diferencia. Responde { jobId }. Nivel registro."
 *   get:
 *     tags: [Tesorería]
 *     summary: "Estado del análisis (?job=): corriendo | listo (con las propuestas) | error."
 */
export const POST = conTesoreria("registro", ({ user, body }) => iniciarAnalisis(user, body || {}));
export const GET = conTesoreria("registro", ({ user, query }) => verAnalisis(user, query.job));
