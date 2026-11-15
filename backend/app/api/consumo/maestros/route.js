import { conConsumo } from "@/lib/consumo/ruta";
import { catalogos } from "@/lib/consumo/maestros";

/**
 * @openapi
 * /api/consumo/maestros:
 *   get:
 *     tags: [Consumo]
 *     summary: "Maestros de Consumo: sedes con sus cuentas de servicio y medidores, empresas de servicio y cuántos recibos usan cada valor."
 */
export const GET = conConsumo("consulta", () => catalogos());
