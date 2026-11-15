import { conTesoreria } from "@/lib/tesoreria/ruta";
import { marcarRegistrado } from "@/lib/tesoreria/soportesCorreo";

/**
 * @openapi
 * /api/tesoreria/soportes-correo/{id}/registrar:
 *   post:
 *     tags: [Tesorería]
 *     summary: "Marca el soporte como registrado con su movimiento ({ movimientoId }), después de guardarlo o de adjuntarlo a uno existente. Nivel registro."
 */
export const POST = conTesoreria("registro", ({ user, params, body }) => marcarRegistrado(user, params.id, body?.movimientoId));
