import { conConsumo } from "@/lib/consumo/ruta";
import { auditoria } from "@/lib/consumo/analisis";

/**
 * @openapi
 * /api/consumo/analisis/auditoria:
 *   get:
 *     tags: [Consumo]
 *     summary: "Auditoría y hallazgos de una sede (secciones A a G del Excel del contador). Filtros: sedeId (por defecto la de más recibos), servicio, anio."
 */
export const GET = conConsumo("consulta", ({ query }) => auditoria(query));
