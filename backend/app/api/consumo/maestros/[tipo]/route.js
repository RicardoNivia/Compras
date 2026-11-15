import { conConsumo } from "@/lib/consumo/ruta";
import { crearMaestro } from "@/lib/consumo/maestros";

/**
 * @openapi
 * /api/consumo/maestros/{tipo}:
 *   post:
 *     tags: [Consumo]
 *     summary: "Crea una sede, una empresa de servicio o una cuenta de servicio (tipo: sede | empresa | cuenta). La cuenta acepta `medidores`."
 */
export const POST = conConsumo("admin", ({ user, params, body }) => crearMaestro(user, params.tipo, body || {}));
