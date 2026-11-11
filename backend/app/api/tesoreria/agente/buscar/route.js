import { conTesoreria } from "@/lib/tesoreria/ruta";
import { buscarPropuestas, buscarPorPagos } from "@/lib/tesoreria/agenteAsociacion";

/**
 * @openapi
 * /api/tesoreria/agente/buscar:
 *   post:
 *     tags: [Tesorería]
 *     summary: "Corre un agente de asociación (solo propone). Body: { agente: movimientos | pagos, anio?, mes?, alcance?: todos | vencidos | pagadosSinMovimiento } (nivel registro)."
 */
export const POST = conTesoreria("registro", ({ user, body = {} }) => (body.agente === "pagos" ? buscarPorPagos(user, body) : buscarPropuestas(user)));
