import { conTesoreria } from "@/lib/tesoreria/ruta";
import { catalogos, usos, TIPOS_CUENTA, FORMATOS_EXTRACTO } from "@/lib/tesoreria/maestros";

/**
 * @openapi
 * /api/tesoreria/maestros:
 *   get:
 *     tags: [Tesorería]
 *     summary: "Catálogos de Tesorería (cuentas con moneda ISO 4217, ítems, conceptos, pagadores) y cuántos movimientos usan cada valor."
 */
export const GET = conTesoreria("consulta", async () => ({ ...(await catalogos()), usos: await usos(), tiposCuenta: TIPOS_CUENTA, formatosExtracto: FORMATOS_EXTRACTO }));
