import { conTesoreria } from "@/lib/tesoreria/ruta";
import { detalleSoporteCorreo } from "@/lib/tesoreria/soportesCorreo";

/**
 * @openapi
 * /api/tesoreria/soportes-correo/{id}:
 *   get:
 *     tags: [Tesorería]
 *     summary: "Un soporte del correo con lo que Nova leyó, los movimientos que ya parecen ser este y los pagos posibles (calculados por código). Nivel registro."
 */
export const GET = conTesoreria("registro", ({ params }) => detalleSoporteCorreo(params.id));
