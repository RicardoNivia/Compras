import { conTesoreria } from "@/lib/tesoreria/ruta";
import { catalogos, usos, FORMATOS_EXTRACTO } from "@/lib/tesoreria/maestros";

/**
 * @openapi
 * /api/tesoreria/maestros:
 *   get:
 *     tags: [Tesorería]
 *     summary: "Catálogos de Tesorería (bancos, medios de pago, ítems, conceptos y Paga) y cuántos movimientos o pagos usan cada valor."
 */
export const GET = conTesoreria("consulta", async () => ({ ...(await catalogos()), usos: await usos(), formatosExtracto: FORMATOS_EXTRACTO }));
