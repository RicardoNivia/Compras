import { conTesoreria } from "@/lib/tesoreria/ruta";
import { editarGasto, borrarGasto, vistaApagar } from "@/lib/tesoreria/periodicos";

/**
 * @openapi
 * /api/tesoreria/periodicos/{id}:
 *   get:
 *     tags: [Tesorería]
 *     summary: "Qué pasaría al apagarlo: pagos en P desde hoy que se borran y los que se conservan por tener movimientos."
 *   patch:
 *     tags: [Tesorería]
 *     summary: "Edita o activa/desactiva el gasto; rehace sus pagos futuros pendientes sin movimientos (nivel registro)."
 *   delete:
 *     tags: [Tesorería]
 *     summary: "Borra el gasto si ninguno de sus pagos está pagado ni tiene movimientos (nivel registro)."
 */
export const GET = conTesoreria("consulta", ({ params }) => vistaApagar(params.id));
export const PATCH = conTesoreria("registro", ({ user, params, body }) => editarGasto(user, params.id, body || {}));
export const DELETE = conTesoreria("registro", ({ user, params }) => borrarGasto(user, params.id));
