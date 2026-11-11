import { conTesoreria } from "@/lib/tesoreria/ruta";
import { excelReportes } from "@/lib/tesoreria/cierre";
import { pivote } from "@/lib/tesoreria/pivote";

/**
 * @openapi
 * /api/tesoreria/reportes:
 *   get:
 *     tags: [Tesorería]
 *     summary: "Tablas dinámicas como las hojas del Excel: vista=ejecutado (Tipo → Ítem → Concepto) o vista=medio (Cuenta → Tipo → Ítem → Concepto), mes a mes, por moneda ISO 4217. Filtros: anio, estado (ejecutado|proyectado), cuentaId, pagadorId, itemId, tipo (ingreso|egreso), mesDesde, mesHasta, traslados=1. formato=xlsx descarga el Excel del año."
 */
export const GET = conTesoreria("consulta", async ({ user, query }) => {
  const anio = Number(query.anio) || new Date().getFullYear();
  if (query.formato === "xlsx") {
    const buf = await excelReportes(user, anio);
    return new Response(buf, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="tesoreria-${anio}.xlsx"`, "Cache-Control": "private, no-store" } });
  }
  return pivote({ anio, vista: query.vista === "medio" ? "medio" : "ejecutado", estado: query.estado, cuentaId: query.cuentaId, pagadorId: query.pagadorId, itemId: query.itemId, tipo: query.tipo, mesDesde: query.mesDesde, mesHasta: query.mesHasta, traslados: query.traslados === "1" });
});
