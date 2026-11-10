import { conTesoreria } from "@/lib/tesoreria/ruta";
import { autoConciliar } from "@/lib/tesoreria/conciliacion";
import { rangoMes } from "@/lib/tesoreria/comun";

/**
 * @openapi
 * /api/tesoreria/conciliacion/auto:
 *   post:
 *     tags: [Tesorería]
 *     summary: "Vuelve a correr el enlace automático de una cuenta en un mes ({ cuentaId, anio, mes }). Nivel registro."
 */
export const POST = conTesoreria("registro", async ({ body }) => {
  const r = rangoMes(Number(body?.anio), Number(body?.mes));
  return { enlazadas: await autoConciliar(Number(body?.cuentaId), r) };
});
