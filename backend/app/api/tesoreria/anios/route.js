import { conTesoreria } from "@/lib/tesoreria/ruta";
import { listAnios, crearAnio } from "@/lib/tesoreria/anios";

/**
 * @openapi
 * /api/tesoreria/anios:
 *   get:
 *     tags: [Tesorería]
 *     summary: "Años de los selectores: por defecto hasta 2028, los que tienen datos y los creados a mano."
 *   post:
 *     tags: [Tesorería]
 *     summary: "Crea otro año (solo desde Gastos periódicos, nivel registro). Body: { anio }."
 */
export const GET = conTesoreria("consulta", () => listAnios());
export const POST = conTesoreria("registro", ({ user, body }) => crearAnio(user, body || {}));
