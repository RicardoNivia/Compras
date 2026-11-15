import { conTesoreria } from "@/lib/tesoreria/ruta";
import { descartarSoporteCorreo } from "@/lib/tesoreria/soportesCorreo";

/**
 * @openapi
 * /api/tesoreria/soportes-correo/{id}/descartar:
 *   post:
 *     tags: [Tesorería]
 *     summary: "Descarta un soporte del correo ({ motivo } opcional). Nivel registro."
 */
export const POST = conTesoreria("registro", ({ user, params, body }) => descartarSoporteCorreo(user, params.id, body?.motivo));
