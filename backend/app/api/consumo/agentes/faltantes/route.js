import { conConsumo } from "@/lib/consumo/ruta";
import { recibosFaltantes } from "@/lib/consumo/agentes";

/**
 * @openapi
 * /api/consumo/agentes/faltantes:
 *   get:
 *     tags: [Consumo]
 *     summary: "Agente de recibos faltantes: cuentas activas con recibos atrasados, huecos entre recibos o sin recibos. Filtros: sedeId, servicio, tipo (atrasado | hueco | sin_recibos), q. Se calcula al vuelo."
 */
export const GET = conConsumo("consulta", ({ query }) => recibosFaltantes(query));
