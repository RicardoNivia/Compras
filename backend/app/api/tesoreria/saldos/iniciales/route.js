import { conTesoreria } from "@/lib/tesoreria/ruta";
import { guardarSaldoInicial } from "@/lib/tesoreria/saldos";

/**
 * @openapi
 * /api/tesoreria/saldos/iniciales:
 *   put:
 *     tags: [Tesorería]
 *     summary: "Guarda el saldo inicial de enero de un banco y año ({ bancoId, anio, valor }; valor vacío lo quita) (nivel registro)."
 */
export const PUT = conTesoreria("registro", ({ user, body = {} }) => guardarSaldoInicial(user, body));
