import { conTesoreria } from "@/lib/tesoreria/ruta";
import { generarProyectados } from "@/lib/tesoreria/recurrentes";

/**
 * @openapi
 * /api/tesoreria/recurrentes/generar:
 *   post:
 *     tags: [Tesorería]
 *     summary: "Genera ya los proyectados que falten de todos los pagos recurrentes (del mes actual a tres meses). Nivel registro."
 */
export const POST = conTesoreria("registro", async ({ user }) => ({ generados: await generarProyectados({ actor: user }) }));
