import { prisma } from "@/lib/prisma";
import { hoyColombia } from "@/lib/hoyColombia";
import { fmtMoneda, rangoMes } from "@/lib/tesoreria/comun";
import { mapasCatalogos } from "@/lib/tesoreria/movimientos";
import { signoEnCuenta } from "@/lib/tesoreria/conciliacion";

// Cifras del flujo de caja, siempre calculadas aquí (Nova y la pantalla solo las muestran). Nunca se suman monedas
// distintas: todo va agrupado por código ISO 4217. Los traslados entre cuentas propias no cuentan como ingreso ni egreso.

const num = (d) => (d == null ? 0 : Number(d));
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export async function saldosPorCuenta(hasta = hoyColombia()) {
  const [cuentas, movs] = await Promise.all([
    prisma.cuentaTesoreria.findMany({ where: { activo: true }, orderBy: { nombre: "asc" } }),
    prisma.movimientoTesoreria.findMany({ where: { estado: "ejecutado", fecha: { lte: hasta } }, select: { tipo: true, valor: true, cuentaId: true, cuentaDestinoId: true, fecha: true } }),
  ]);
  return cuentas.map((c) => {
    const desde = c.saldoInicialFecha || "0000-00-00";
    const saldo = num(c.saldoInicial) + movs.filter((m) => m.fecha >= desde && (m.cuentaId === c.id || m.cuentaDestinoId === c.id)).reduce((a, m) => a + signoEnCuenta(m, c.id), 0);
    return { id: c.id, nombre: c.nombre, tipo: c.tipo, moneda: c.moneda, saldo, saldoTexto: fmtMoneda(saldo, c.moneda), desde: c.saldoInicialFecha };
  });
}

// anio + mes opcional. Devuelve todo por moneda (normalmente solo COP).
export async function resumenTesoreria({ anio, mes } = {}) {
  const hoy = hoyColombia();
  anio = Number(anio) || Number(hoy.slice(0, 4));
  mes = mes ? Number(mes) : null;
  const [movs, mapas, saldos, cierres] = await Promise.all([
    prisma.movimientoTesoreria.findMany({ where: { fecha: { gte: `${anio}-01-01`, lte: `${anio}-12-31` } }, select: { id: true, fecha: true, tipo: true, estado: true, valor: true, moneda: true, itemId: true, conceptoId: true, concepto: true, cuentaId: true, pagadorId: true, _count: { select: { lineas: true } } } }),
    mapasCatalogos(),
    saldosPorCuenta(),
    prisma.cierreMes.findMany({ where: { anio }, select: { mes: true, firmadoPorNombre: true, createdAt: true } }),
  ]);
  const monedas = [...new Set(movs.map((m) => m.moneda))].sort((a, b) => (a === "COP" ? -1 : b === "COP" ? 1 : a.localeCompare(b)));
  const porMoneda = monedas.map((moneda) => {
    const ms = movs.filter((m) => m.moneda === moneda && m.tipo !== "traslado");
    const fm = (v) => fmtMoneda(v, moneda);
    const porMes = MESES.map((nombre, i) => {
      const delMes = ms.filter((m) => Number(m.fecha.slice(5, 7)) === i + 1);
      const suma = (tipo, estado) => delMes.filter((m) => m.tipo === tipo && m.estado === estado).reduce((a, m) => a + num(m.valor), 0);
      return { mes: i + 1, nombre, ingresos: suma("ingreso", "ejecutado"), egresos: suma("egreso", "ejecutado"), ingresosProyectados: suma("ingreso", "proyectado"), egresosProyectados: suma("egreso", "proyectado") };
    });
    const periodo = mes ? ms.filter((m) => Number(m.fecha.slice(5, 7)) === mes) : ms;
    const ej = periodo.filter((m) => m.estado === "ejecutado");
    const ingresos = ej.filter((m) => m.tipo === "ingreso").reduce((a, m) => a + num(m.valor), 0);
    const egresos = ej.filter((m) => m.tipo === "egreso").reduce((a, m) => a + num(m.valor), 0);
    const proy = periodo.filter((m) => m.estado === "proyectado");
    const agrupar = (lista, clave, nombreDe) => {
      const g = new Map();
      for (const m of lista) { const k = m[clave] ?? 0; g.set(k, (g.get(k) || 0) + num(m.valor)); }
      return [...g.entries()].map(([id, valor]) => ({ id, nombre: nombreDe(id), valor, valorTexto: fm(valor) })).sort((a, b) => b.valor - a.valor);
    };
    const nombreItem = (id) => mapas.items.get(id)?.nombre || "Sin ítem";
    // Mes anterior para comparar (solo en vista mensual).
    let comparacion = null;
    if (mes && mes > 1) {
      const ant = porMes[mes - 2];
      const pct = (a, b) => (b ? Math.round(((a - b) / b) * 1000) / 10 : null);
      comparacion = { ingresosPct: pct(ingresos, ant.ingresos), egresosPct: pct(egresos, ant.egresos) };
    }
    return {
      moneda,
      kpis: {
        ingresos, ingresosTexto: fm(ingresos), egresos, egresosTexto: fm(egresos), neto: ingresos - egresos, netoTexto: fm(ingresos - egresos),
        ingresosProyectados: proy.filter((m) => m.tipo === "ingreso").reduce((a, m) => a + num(m.valor), 0),
        egresosProyectados: proy.filter((m) => m.tipo === "egreso").reduce((a, m) => a + num(m.valor), 0),
        movimientos: periodo.length, sinConciliar: ej.filter((m) => !m._count.lineas).length,
      },
      comparacion,
      porMes,
      egresosPorItem: agrupar(ej.filter((m) => m.tipo === "egreso"), "itemId", nombreItem),
      ingresosPorItem: agrupar(ej.filter((m) => m.tipo === "ingreso"), "itemId", nombreItem),
    };
  });
  const enUnMes = new Date(Date.parse(`${hoy}T00:00:00Z`) + 31 * 86400000).toISOString().slice(0, 10);
  const proximos = await prisma.movimientoTesoreria.findMany({ where: { estado: "proyectado", fecha: { gte: hoy, lte: enUnMes } }, orderBy: { fecha: "asc" }, take: 8 });
  const vencidos = await prisma.movimientoTesoreria.count({ where: { estado: "proyectado", fecha: { lt: hoy } } });
  return {
    anio, mes, hoy,
    porMoneda,
    saldos,
    cierres: cierres.map((c) => ({ mes: c.mes, por: c.firmadoPorNombre, at: c.createdAt })),
    proyectadosVencidos: vencidos,
    proximos: proximos.map((m) => ({ id: m.id, fecha: m.fecha, tipo: m.tipo, concepto: m.concepto, item: m.itemId ? mapas.items.get(m.itemId)?.nombre : null, cuenta: mapas.cuentas.get(m.cuentaId)?.nombre, valorTexto: fmtMoneda(m.valor, m.moneda) })),
  };
}

// Reporte «Ejecutado» (como la hoja del Excel): tipo → ítem → concepto, mes a mes, por moneda. Sin traslados.
export async function reporteEjecutado({ anio, porCuenta = false }) {
  const mapas = await mapasCatalogos();
  const movs = await prisma.movimientoTesoreria.findMany({ where: { estado: "ejecutado", tipo: { not: "traslado" }, fecha: { gte: `${anio}-01-01`, lte: `${anio}-12-31` } } });
  const filas = new Map();
  for (const m of movs) {
    const grupo = porCuenta ? mapas.cuentas.get(m.cuentaId)?.nombre || "—" : m.tipo === "ingreso" ? "Ingresos" : "Egresos";
    const item = mapas.items.get(m.itemId)?.nombre || "Sin ítem";
    const concepto = (m.conceptoId && mapas.conceptos.get(m.conceptoId)?.nombre) || m.concepto;
    const k = `${m.moneda}|${grupo}|${item}|${concepto}`;
    if (!filas.has(k)) filas.set(k, { moneda: m.moneda, grupo, item, concepto, meses: Array(12).fill(0) });
    filas.get(k).meses[Number(m.fecha.slice(5, 7)) - 1] += m.tipo === "egreso" ? -num(m.valor) : num(m.valor);
  }
  return [...filas.values()].sort((a, b) => a.moneda.localeCompare(b.moneda) || a.grupo.localeCompare(b.grupo) || a.item.localeCompare(b.item) || a.concepto.localeCompare(b.concepto));
}

export { rangoMes };
