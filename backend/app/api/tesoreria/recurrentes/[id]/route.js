import { conTesoreria } from "@/lib/tesoreria/ruta";
import { editarRecurrencia, borrarRecurrencia } from "@/lib/tesoreria/recurrentes";

/**
 * @openapi
 * /api/tesoreria/recurrentes/{id}:
 *   patch:
 *     tags: [Tesorería]
 *     summary: "Edita, activa o apaga un pago recurrente; rehace solo los proyectados futuros sin pagar ni conciliar. Nivel registro."
 *   delete:
 *     tags: [Tesorería]
 *     summary: "Borra el pago recurrente y sus proyectados futuros sin pagar; lo ya pagado queda. Nivel registro."
 */
export const PATCH = conTesoreria("registro", ({ user, params, body }) => editarRecurrencia(user, params.id, body || {}));
export const DELETE = conTesoreria("registro", ({ user, params }) => borrarRecurrencia(user, params.id));
