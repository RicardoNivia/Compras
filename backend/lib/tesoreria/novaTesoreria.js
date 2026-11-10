import { prisma } from "@/lib/prisma";
import { accesoDe, sinTildes } from "@/lib/tesoreria/comun";
import { resumenTesoreria } from "@/lib/tesoreria/resumen";
import { listMovimientos } from "@/lib/tesoreria/movimientos";
import { estadoConciliacion } from "@/lib/tesoreria/conciliacion";
import { estadoCierre } from "@/lib/tesoreria/cierre";

// Herramientas de Nova para Tesorería. Solo se le ofrecen a quien tiene acceso nominal al módulo (el chat lo decide con
// accesoDe) y cada llamada lo vuelve a comprobar. NO se publican en el servidor MCP de Claude. Son de solo lectura y
// devuelven cifras ya calculadas, con su moneda ISO 4217.

export const TOOLS_TESORERIA = [
  {
    name: "resumen_tesoreria",
    description: "Flujo de caja del módulo de Tesorería: ingresos, egresos y neto EJECUTADOS y PROYECTADOS por mes, egresos e ingresos por ítem (inmueble, oficinas, impuestos…), saldos por cuenta y próximos pagos. Todo calculado y con su moneda ISO 4217 (los textos ya vienen formateados, p. ej. «COP 1.234.567»: úsalos tal cual). Los traslados entre cuentas propias no cuentan como ingreso ni egreso.",
    input_schema: { type: "object", properties: { anio: { type: "integer", description: "Año (opcional, por defecto el actual)." }, mes: { type: "integer", description: "Mes 1-12 (opcional; sin mes, el año)." } } },
  },
  {
    name: "buscar_movimientos_tesoreria",
    description: "Movimientos individuales del libro de Tesorería (para citar pagos puntuales, NO para totales: para totales usa resumen_tesoreria). Filtra por texto (concepto, tercero o referencia), año, mes, cuenta, ítem, tipo y estado. Devuelve como máximo 'limite' filas y el total real.",
    input_schema: {
      type: "object",
      properties: {
        texto: { type: "string" }, anio: { type: "integer" }, mes: { type: "integer" },
        cuenta: { type: "string", description: "Nombre o parte del nombre de la cuenta (AV Villas, Credicorp…)." },
        item: { type: "string", description: "Nombre o parte del nombre del ítem." },
        tipo: { type: "string", enum: ["ingreso", "egreso", "traslado"] },
        estado: { type: "string", enum: ["proyectado", "ejecutado", "conciliado", "porConciliar", "sinSoporte"] },
        limite: { type: "integer", description: "Máximo de filas (por defecto 20, máximo 50)." },
      },
    },
  },
  {
    name: "estado_conciliacion_tesoreria",
    description: "Conciliación de una cuenta en un mes: neto según el banco y según el libro, diferencia, líneas enlazadas, sugerencias por confirmar, lo que está solo en el banco y lo que está solo en el libro.",
    input_schema: { type: "object", properties: { cuenta: { type: "string" }, anio: { type: "integer" }, mes: { type: "integer" } }, required: ["cuenta", "anio", "mes"] },
  },
  {
    name: "estado_cierre_tesoreria",
    description: "Qué falta para firmar el cierre de un mes de Tesorería (soportes, conciliación por cuenta, proyectados vencidos) y si ya está firmado.",
    input_schema: { type: "object", properties: { anio: { type: "integer" }, mes: { type: "integer" } }, required: ["anio", "mes"] },
  },
];
export const NOMBRES_TESORERIA = new Set(TOOLS_TESORERIA.map((t) => t.name));

async function idPorNombre(modelo, texto) {
  if (!texto) return undefined;
  const t = sinTildes(texto);
  const filas = await modelo.findMany({ select: { id: true, nombre: true } });
  return (filas.find((f) => sinTildes(f.nombre) === t) || filas.find((f) => sinTildes(f.nombre).includes(t)))?.id ?? -1;
}

export async function ejecutarTesoreria(name, args, user) {
  if (!user || !(await accesoDe(user.id))) return { error: "Esta persona no tiene acceso a Tesorería." };
  switch (name) {
    case "resumen_tesoreria": {
      const r = await resumenTesoreria({ anio: args.anio, mes: args.mes });
      return {
        anio: r.anio, mes: r.mes,
        porMoneda: r.porMoneda.map((m) => {
          // Porcentajes ya calculados: Nova no los calcula.
          const pct = (v, total) => (total ? Math.round((v / total) * 1000) / 10 : 0);
          return {
            moneda: m.moneda, kpis: m.kpis, comparacionConMesAnterior: m.comparacion,
            porMes: m.porMes.filter((x) => x.ingresos || x.egresos || x.ingresosProyectados || x.egresosProyectados),
            egresosPorItem: m.egresosPorItem.slice(0, 15).map(({ nombre, valor, valorTexto }) => ({ item: nombre, valor: valorTexto, porcentajeDelEgreso: pct(valor, m.kpis.egresos) })),
            ingresosPorItem: m.ingresosPorItem.slice(0, 10).map(({ nombre, valor, valorTexto }) => ({ item: nombre, valor: valorTexto, porcentajeDelIngreso: pct(valor, m.kpis.ingresos) })),
          };
        }),
        saldos: r.saldos.map((s) => ({ cuenta: s.nombre, tipo: s.tipo, saldo: s.saldoTexto, signo: s.saldo < 0 ? "negativo" : s.saldo > 0 ? "positivo" : "cero", desde: s.desde })),
        proximosPagos: r.proximos, proyectadosVencidos: r.proyectadosVencidos,
        nota: "Los valores numéricos de porMes y kpis están en la moneda indicada (ISO 4217). Muestra dinero con el código de moneda, p. ej. «COP 1.234.567».",
      };
    }
    case "buscar_movimientos_tesoreria": {
      const limite = Math.min(Math.max(1, Number(args.limite) || 20), 50);
      const r = await listMovimientos({
        q: args.texto, anio: args.anio, mes: args.mes, tipo: args.tipo, estado: args.estado,
        cuentaId: await idPorNombre(prisma.cuentaTesoreria, args.cuenta), itemId: await idPorNombre(prisma.itemTesoreria, args.item),
        size: 50, page: 1,
      });
      return {
        total: r.total, totalesDelFiltro: r.totales,
        movimientos: r.items.slice(0, limite).map((m) => ({ id: m.id, fecha: m.fecha, fechaAproximada: m.fechaAproximada, tipo: m.tipo, estado: m.estado, conciliado: m.conciliado, valor: m.valorTexto, cuenta: m.cuenta, cuentaDestino: m.cuentaDestino, item: m.item, concepto: m.concepto, paga: m.pagador, tercero: m.tercero, soportes: m.soportes })),
      };
    }
    case "estado_conciliacion_tesoreria": {
      const cuentaId = await idPorNombre(prisma.cuentaTesoreria, args.cuenta);
      if (!cuentaId || cuentaId < 0) return { error: `No hay una cuenta llamada «${args.cuenta}».` };
      const e = await estadoConciliacion(cuentaId, Number(args.anio), Number(args.mes));
      return {
        cuenta: e.cuenta.nombre, periodo: e.periodo, firmado: e.firmado, tieneExtracto: e.tieneExtracto, resumen: e.resumen,
        sugerencias: e.sugerencias.slice(0, 10).map((s) => ({ linea: `${s.linea.fecha} · ${s.linea.descripcion} · ${s.linea.valorTexto}`, candidato: s.candidatos[0] ? `${s.candidatos[0].concepto} (${s.candidatos[0].fecha})` : null })),
        soloBanco: e.soloBanco.slice(0, 15).map((l) => ({ fecha: l.fecha, descripcion: l.descripcion, valor: l.valorTexto, propuesta: l.propuesta?.concepto || null })),
        soloLibro: e.soloLibro.slice(0, 15).map((m) => ({ fecha: m.fecha, concepto: m.concepto, valor: m.valorTexto })),
      };
    }
    case "estado_cierre_tesoreria":
      return estadoCierre(args.anio, args.mes);
    default:
      return { error: `Herramienta desconocida: ${name}` };
  }
}
