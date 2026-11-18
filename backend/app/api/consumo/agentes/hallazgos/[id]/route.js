import { conConsumo } from "@/lib/consumo/ruta";
import { obtenerHallazgo, resolverHallazgo } from "@/lib/consumo/agentes";

/**
 * @openapi
 * /api/consumo/agentes/hallazgos/{id}:
 *   get:
 *     tags: [Consumo]
 *     summary: "Un hallazgo con su reclamación (si la tiene)."
 *   post:
 *     tags: [Consumo]
 *     summary: "Resolver, descartar (con nota obligatoria) o reabrir un hallazgo: { accion, nota }."
 */
export const GET = conConsumo("consulta", ({ params }) => obtenerHallazgo(params.id));
export const POST = conConsumo("registro", ({ user, params, body }) => resolverHallazgo(user, params.id, body || {}));
