import { conTesoreria } from "@/lib/tesoreria/ruta";
import { listRecurrencias, crearRecurrencia } from "@/lib/tesoreria/recurrentes";

/**
 * @openapi
 * /api/tesoreria/recurrentes:
 *   get:
 *     tags: [Tesorería]
 *     summary: "Pagos recurrentes con su próximo proyectado y cuántos se han generado y ejecutado."
 *   post:
 *     tags: [Tesorería]
 *     summary: "Crea un pago recurrente ({ nombre, tipo, valor, valorVariable, cuentaId, cuentaDestinoId, conceptoId, itemId, pagadorId, tercero, frecuencia, diaDelMes, desde, hasta }) y genera sus proyectados. Nivel registro."
 */
export const GET = conTesoreria("consulta", async () => ({ recurrentes: await listRecurrencias() }));
export const POST = conTesoreria("registro", ({ user, body }) => crearRecurrencia(user, body || {}));
