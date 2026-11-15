import { conConsumo } from "@/lib/consumo/ruta";
import { listarRecibos, crearRecibo } from "@/lib/consumo/recibos";

/**
 * @openapi
 * /api/consumo/recibos:
 *   get:
 *     tags: [Consumo]
 *     summary: "Recibos de servicios públicos, paginados, con lo calculado (por día, costo por unidad, variación). Filtros: q, sedeId, servicio, anio, pago (pendiente | vencido | pagado | saldo_favor), lectura (real | no_real | sin_consumo), page, size."
 *   post:
 *     tags: [Consumo]
 *     summary: "Registra un recibo a mano. Lleva `cuentaId`, o `cuenta` (sedeId, servicio, numeroCuenta…) para crear la cuenta en la sede elegida; `cargos` opcional."
 */
export const GET = conConsumo("consulta", ({ query }) => listarRecibos(query));
export const POST = conConsumo("registro", ({ user, body }) => crearRecibo(user, body || {}));
