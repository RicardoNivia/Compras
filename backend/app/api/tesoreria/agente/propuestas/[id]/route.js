import { conTesoreria } from "@/lib/tesoreria/ruta";
import { resolverPropuesta } from "@/lib/tesoreria/agenteAsociacion";

/**
 * @openapi
 * /api/tesoreria/agente/propuestas/{id}:
 *   post:
 *     tags: [Tesorería]
 *     summary: "Acepta o descarta una propuesta ({ accion: aceptar|descartar }) (nivel registro)."
 */
export const POST = conTesoreria("registro", ({ user, params, body = {} }) => resolverPropuesta(user, params.id, body.accion));
