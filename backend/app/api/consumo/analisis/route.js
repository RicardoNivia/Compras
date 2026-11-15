import { conConsumo } from "@/lib/consumo/ruta";
import { resumen } from "@/lib/consumo/analisis";

/**
 * @openapi
 * /api/consumo/analisis:
 *   get:
 *     tags: [Consumo]
 *     summary: "Resumen ejecutivo de Consumo (indicadores antes → después, conclusiones y datos de las gráficas). Filtros: sedeId, servicio (por defecto energia), anio."
 */
export const GET = conConsumo("consulta", ({ query }) => resumen(query));
