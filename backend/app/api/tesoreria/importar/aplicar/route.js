import { conTesoreria } from "@/lib/tesoreria/ruta";
import { aplicarExcel } from "@/lib/tesoreria/importarExcelApp";

/**
 * @openapi
 * /api/tesoreria/importar/aplicar:
 *   post:
 *     tags: [Tesorería]
 *     summary: "Carga la plantilla analizada ({ token, modo: agregar | reemplazar }). Agregar: crea lo nuevo y pasa a ejecutado lo que cambió (no duplica). Reemplazar: borra antes todo lo de Tesorería (solo firma)."
 */
export const POST = conTesoreria("registro", ({ user, acceso, body }) => aplicarExcel(user, acceso, body || {}));
