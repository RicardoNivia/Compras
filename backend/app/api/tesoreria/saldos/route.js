import { conTesoreria } from "@/lib/tesoreria/ruta";
import { reporteSaldos, saldosIniciales } from "@/lib/tesoreria/saldos";

/**
 * @openapi
 * /api/tesoreria/saldos:
 *   get:
 *     tags: [Tesorería]
 *     summary: "Saldo de cada banco mes a mes en el año (anio) y los saldos iniciales registrados."
 */
export const GET = conTesoreria("consulta", async ({ query }) => ({ reporte: await reporteSaldos(query.anio), iniciales: await saldosIniciales(query.anio) }));
