import { conTesoreria } from "@/lib/tesoreria/ruta";
import { aprobarDecisiones } from "@/lib/tesoreria/agenteConciliacion";

/**
 * @openapi
 * /api/tesoreria/conciliacion/agente/aprobar:
 *   post:
 *     tags: [Tesorería]
 *     summary: "Aplica las decisiones aprobadas ({ decisiones: [{ ref, accion: enlazar|crear|ignorar|mover|pendiente, lineaId, movimientoId, conceptoId, itemId, pagadorId }] }), cada una con su auditoría. Nivel registro."
 */
export const POST = conTesoreria("registro", ({ user, body }) => aprobarDecisiones(user, body?.decisiones));
