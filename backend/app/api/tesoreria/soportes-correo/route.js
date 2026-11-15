import { conTesoreria } from "@/lib/tesoreria/ruta";
import { listarSoportesCorreo } from "@/lib/tesoreria/soportesCorreo";

/**
 * @openapi
 * /api/tesoreria/soportes-correo:
 *   get:
 *     tags: [Tesorería]
 *     summary: "Soportes de pago que llegaron al correo de soportes y que Nova leyó (?estado=pendiente|registrado|descartado&page&size). Nivel registro."
 */
export const GET = conTesoreria("registro", ({ query }) => listarSoportesCorreo(query));
