import { conConsumo } from "@/lib/consumo/ruta";
import { listarHallazgos, revisarHallazgos } from "@/lib/consumo/agentes";

/**
 * @openapi
 * /api/consumo/agentes/hallazgos:
 *   get:
 *     tags: [Consumo]
 *     summary: "Hallazgos del agente en todas las sedes. Filtros: estado (abierto | resuelto | descartado | todos), nivel, confianza, sedeId, servicio, tipo, reclamacion (con | sin | borrador | radicada), q, page, size."
 *   post:
 *     tags: [Consumo]
 *     summary: "Revisar ahora: corre el agente de hallazgos en todas las sedes (o en sedeId/servicio) y sincroniza la lista."
 */
export const GET = conConsumo("consulta", ({ query }) => listarHallazgos(query));
export const POST = conConsumo("registro", ({ user, body }) => revisarHallazgos(user, { sedeId: body?.sedeId, servicio: body?.servicio, origen: "manual" }));
