import { conTesoreria } from "@/lib/tesoreria/ruta";
import { aceptarConfianzaAlta } from "@/lib/tesoreria/agenteAsociacion";

/**
 * @openapi
 * /api/tesoreria/agente/aceptar-altas:
 *   post:
 *     tags: [Tesorería]
 *     summary: "Acepta todas las propuestas pendientes de confianza alta (nivel registro)."
 */
export const POST = conTesoreria("registro", ({ user, body = {} }) => aceptarConfianzaAlta(user, body.agente));
