import { conTesoreria } from "@/lib/tesoreria/ruta";
import { pivote, excelReportes } from "@/lib/tesoreria/pivote";

/**
 * @openapi
 * /api/tesoreria/reportes:
 *   get:
 *     tags: [Tesorería]
 *     summary: "Tablas dinámicas como las hojas del Excel sobre los pagos programados: vista=ejecutado (Tipo → Ítem → Concepto) o vista=medio (Medio de pago → Tipo → Ítem → Concepto), mes a mes. Filtros: anio, estado (E|P|todos), medioPagoId, pagadorId, itemId, tipo, mesDesde, mesHasta, todosLosTipos=1. formato=xlsx descarga el Excel del año."
 */
export const GET = conTesoreria("consulta", async ({ user, query }) => {
  const anio = Number(query.anio) || new Date().getFullYear();
  if (query.formato === "xlsx") {
    const buf = await excelReportes(user, anio, query.estado || "E");
    return new Response(buf, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="tesoreria-${anio}.xlsx"`, "Cache-Control": "private, no-store" } });
  }
  return pivote({ anio, vista: query.vista === "medio" ? "medio" : "ejecutado", estado: query.estado || "E", medioPagoId: query.medioPagoId, pagadorId: query.pagadorId, itemId: query.itemId, tipo: query.tipo, mesDesde: query.mesDesde, mesHasta: query.mesHasta, todosLosTipos: query.todosLosTipos === "1" });
});
