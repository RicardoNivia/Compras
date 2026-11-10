import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { logTesoreria } from "@/lib/audit";
import { hoyColombia } from "@/lib/hoyColombia";
import { badRequest, rangoMes, fmtMoneda } from "@/lib/tesoreria/comun";
import { estadoConciliacion } from "@/lib/tesoreria/conciliacion";
import { reporteEjecutado, saldosPorCuenta } from "@/lib/tesoreria/resumen";

// Cierre de mes: qué falta para firmar (todas las cuentas con extracto conciliadas con diferencia 0 y sin pendientes,
// los pagos registrados a mano con soporte y ningún proyectado vencido sin resolver). Firmado, el mes es de solo lectura.

const NOMBRE_MES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export async function estadoCierre(anio, mes) {
  anio = Number(anio); mes = Number(mes);
  if (!anio || !(mes >= 1 && mes <= 12)) throw badRequest("Mes inválido.");
  const { desde, hasta } = rangoMes(anio, mes);
  const cierre = await prisma.cierreMes.findUnique({ where: { anio_mes: { anio, mes } } });
  const cuentas = await prisma.cuentaTesoreria.findMany({ where: { activo: true }, orderBy: { nombre: "asc" } });
  const porCuenta = [];
  for (const c of cuentas) {
    const e = await estadoConciliacion(c.id, anio, mes);
    if (!e.tieneExtracto && !e.soloLibro.length) continue;
    porCuenta.push({ cuentaId: c.id, cuenta: c.nombre, moneda: c.moneda, tieneExtracto: e.tieneExtracto, ...e.resumen });
  }
  const [movs, sinSoporte, proyectadosVencidos] = await Promise.all([
    prisma.movimientoTesoreria.count({ where: { fecha: { gte: desde, lte: hasta } } }),
    prisma.movimientoTesoreria.findMany({ where: { fecha: { gte: desde, lte: hasta }, estado: "ejecutado", origen: { in: ["manual", "soporte"] }, soportes: { none: {} } }, select: { id: true, fecha: true, concepto: true, valor: true, moneda: true } }),
    prisma.movimientoTesoreria.findMany({ where: { fecha: { gte: desde, lte: hasta < hoyColombia() ? hasta : hoyColombia() }, estado: "proyectado" }, select: { id: true, fecha: true, concepto: true, valor: true, moneda: true } }),
  ]);
  const cuentasPendientes = porCuenta.filter((c) => c.tieneExtracto && (Math.abs(c.diferencia) >= 0.5 || c.pendientes > 0));
  const cuentasSinExtracto = porCuenta.filter((c) => !c.tieneExtracto);
  const mesTerminado = hasta < hoyColombia();
  const pasos = [
    { clave: "movimientos", ok: movs > 0, titulo: "Movimientos del mes registrados", detalle: `${movs} movimiento(s)` },
    { clave: "soportes", ok: !sinSoporte.length, titulo: "Soportes", detalle: sinSoporte.length ? `${sinSoporte.length} pago(s) registrado(s) a mano sin soporte` : "Todos los pagos registrados a mano tienen soporte", lista: sinSoporte.map((m) => `#${m.id} ${m.fecha} · ${m.concepto} · ${fmtMoneda(m.valor, m.moneda)}`) },
    { clave: "conciliacion", ok: !cuentasPendientes.length, titulo: "Conciliación por cuenta", detalle: cuentasPendientes.length ? cuentasPendientes.map((c) => `${c.cuenta}: ${c.pendientes} pendiente(s), diferencia ${c.diferenciaTexto}`).join(" · ") : "Las cuentas con extracto cuadran" },
    { clave: "extractos", ok: !cuentasSinExtracto.length, aviso: true, titulo: "Extractos cargados", detalle: cuentasSinExtracto.length ? `Sin extracto: ${cuentasSinExtracto.map((c) => c.cuenta).join(", ")} (no bloquea: se firma con lo que hay)` : "Todas las cuentas con movimientos tienen extracto" },
    { clave: "proyectados", ok: !proyectadosVencidos.length, titulo: "Proyectados vencidos", detalle: proyectadosVencidos.length ? `${proyectadosVencidos.length} proyectado(s) del mes sin ejecutar: ejecútalos, muévelos de fecha o bórralos` : "Ninguno", lista: proyectadosVencidos.map((m) => `#${m.id} ${m.fecha} · ${m.concepto} · ${fmtMoneda(m.valor, m.moneda)}`) },
    { clave: "mes", ok: mesTerminado, titulo: "El mes ya terminó", detalle: mesTerminado ? "Sí" : "Un mes se firma cuando termina" },
  ];
  const puedeFirmar = !cierre && pasos.filter((p) => !p.aviso).every((p) => p.ok);
  return {
    anio, mes, nombreMes: `${NOMBRE_MES[mes - 1]} ${anio}`,
    firmado: cierre ? { por: cierre.firmadoPorNombre, at: cierre.createdAt, saldos: JSON.parse(cierre.saldos || "[]") } : null,
    pasos, porCuenta, puedeFirmar,
  };
}

export async function firmarCierre(actor, anio, mes) {
  const e = await estadoCierre(anio, mes);
  if (e.firmado) throw badRequest(`El cierre de ${e.nombreMes} ya está firmado.`);
  if (!e.puedeFirmar) throw badRequest(`Todavía no se puede firmar ${e.nombreMes}: ${e.pasos.filter((p) => !p.ok && !p.aviso).map((p) => p.titulo.toLowerCase()).join(", ")}.`);
  const saldos = (await saldosPorCuenta(rangoMes(e.anio, e.mes).hasta)).map((s) => ({ cuenta: s.nombre, moneda: s.moneda, saldo: s.saldo, saldoTexto: s.saldoTexto }));
  const c = await prisma.cierreMes.create({ data: { anio: e.anio, mes: e.mes, saldos: JSON.stringify(saldos), firmadoPorUserId: actor.id, firmadoPorNombre: actor.nombre || null, creadoPorUserId: actor.id, creadoPorNombre: actor.nombre || null } });
  logTesoreria(actor, { action: "firmar", entityType: "cierreTesoreria", recordId: c.id, recordInfo: `Cierre de ${e.nombreMes}`, after: { periodo: e.nombreMes, diferencias: e.porCuenta.map((x) => `${x.cuenta}: ${x.diferenciaTexto}`).join(" · ") || "Sin cuentas con extracto" } }).catch(() => {});
  return estadoCierre(e.anio, e.mes);
}

// Excel con las hojas «Ejecutado» y «Por medio de pago» del año (valores en la moneda de cada fila, con su código ISO).
export async function excelReportes(actor, anio) {
  const [ejecutado, porCuenta] = await Promise.all([reporteEjecutado({ anio }), reporteEjecutado({ anio, porCuenta: true })]);
  const hoja = (filas, titulo) => {
    const cab = ["Moneda (ISO 4217)", titulo, "Ítem", "Concepto", ...NOMBRE_MES.map((m) => m[0].toUpperCase() + m.slice(1)), "Total"];
    const datos = filas.map((f) => [f.moneda, f.grupo, f.item, f.concepto, ...f.meses.map((v) => Math.round(v * 100) / 100), Math.round(f.meses.reduce((a, b) => a + b, 0) * 100) / 100]);
    const ws = XLSX.utils.aoa_to_sheet([cab, ...datos]);
    ws["!cols"] = [{ wch: 10 }, { wch: 16 }, { wch: 22 }, { wch: 40 }, ...Array(13).fill({ wch: 14 })];
    return ws;
  };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, hoja(ejecutado, "Tipo"), "Ejecutado");
  XLSX.utils.book_append_sheet(wb, hoja(porCuenta, "Cuenta"), "Por medio de pago");
  logTesoreria(actor, { action: "descargar", entityType: "cierreTesoreria", recordId: `reporte-${anio}`, recordInfo: `Reportes de tesorería ${anio} (Excel)` }).catch(() => {});
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}
