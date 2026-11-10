import { conTesoreria } from "@/lib/tesoreria/ruta";
import { detallePivote } from "@/lib/tesoreria/pivote";

/**
 * @openapi
 * /api/tesoreria/reportes/detalle:
 *   get:
 *     tags: [Tesorería]
 *     summary: "Movimientos de una celda de Reportes (como el doble clic de Excel): los mismos filtros de la tabla + moneda, ruta (JSON con los nombres de los grupos; vacío = total general) y mes (0-11; sin mes = columna Total). Paginado (page, size)."
 */
export const GET = conTesoreria("consulta", ({ query }) => {
  let ruta = [];
  try { ruta = JSON.parse(query.ruta || "[]"); } catch { ruta = []; }
  if (!Array.isArray(ruta)) ruta = [];
  return detallePivote(query, { moneda: query.moneda || "COP", ruta: ruta.map(String).slice(0, 4), mes: query.mes === undefined || query.mes === "" ? null : query.mes, page: query.page, size: query.size });
});
