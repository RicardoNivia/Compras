import { conTesoreria } from "@/lib/tesoreria/ruta";
import { proyeccionCaja } from "@/lib/tesoreria/porResolver";

/**
 * @openapi
 * /api/tesoreria/proyeccion:
 *   get:
 *     tags: [Tesorería]
 *     summary: "Proyección de caja por cuenta: saldo de hoy frente a lo que vence en el período (?periodo=esta_semana) con cada cuenta."
 */
export const GET = conTesoreria("consulta", ({ query }) => proyeccionCaja({ periodo: query.periodo || "esta_semana" }));
