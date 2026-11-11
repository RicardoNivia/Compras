import { conTesoreria } from "@/lib/tesoreria/ruta";
import { replicarAnio, vistaReplicar } from "@/lib/tesoreria/periodicos";

/**
 * @openapi
 * /api/tesoreria/periodicos/replicar:
 *   get:
 *     tags: [Tesorería]
 *     summary: "Vista previa de replicar (anio destino, desde = año origen opcional): cuántos gastos y pagos se crearían y cuántos ya existen. No escribe."
 *   post:
 *     tags: [Tesorería]
 *     summary: "Replicar pagos: llena el año { anio } con los gastos periódicos activos (o solo los que tuvieron pagos en { desde }), con el último valor real pagado. No duplica (nivel registro)."
 */
export const GET = conTesoreria("consulta", ({ query }) => vistaReplicar(query.anio, query.desde || null));
export const POST = conTesoreria("registro", ({ user, body = {} }) => replicarAnio(user, body.anio, body.desde || null));
