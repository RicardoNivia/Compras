import { conTesoreria } from "@/lib/tesoreria/ruta";
import { aplicarExtracto } from "@/lib/tesoreria/extractos";

/**
 * @openapi
 * /api/tesoreria/extractos/aplicar:
 *   post:
 *     tags: [Tesorería]
 *     summary: "Registra lo aprobado de un extracto analizado: { token, aprobados: [clave], guardarSaldos } (nivel registro)."
 */
export const POST = conTesoreria("registro", ({ user, body }) => aplicarExtracto(user, body || {}));
