import { conTesoreria } from "@/lib/tesoreria/ruta";
import { detectarRecurrentes } from "@/lib/tesoreria/recurrentes";

/**
 * @openapi
 * /api/tesoreria/recurrentes/detectar:
 *   get:
 *     tags: [Tesorería]
 *     summary: "Propone pagos recurrentes a partir de lo ya pagado (mismo concepto, cuenta y tipo en 3 o más de los últimos 6 meses). Sin IA; no guarda nada."
 */
export const GET = conTesoreria("consulta", async () => ({ propuestas: await detectarRecurrentes() }));
