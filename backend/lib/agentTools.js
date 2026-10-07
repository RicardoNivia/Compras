import { listRecords } from "@/lib/records";
import { listPresupuestos } from "@/lib/presupuestos";
import { listAuditLogs } from "@/lib/audit";
import { buildAggregates } from "@/lib/reportContent";

// Herramientas ("tool use" de Anthropic) que el Agente IA del chat puede
// invocar bajo demanda en vez de recibir TODO el dataset de compras en cada
// mensaje (ver app/api/agent/chat/route.js). Esto resuelve dos problemas del
// diseño anterior: (1) preguntas puntuales ya no cargan los ~500 registros
// completos solo para citar un dato, y (2) preguntas generales ("análisis de
// todas las compras") ya no dependen de que el modelo sume/calcule cientos de
// registros él mismo en su respuesta (lento y propenso a error) — en vez de
// eso, "resumen_compras" calcula los totales exactos del lado del servidor
// sobre el 100% de los datos, sin importar cuántos registros haya.

const MAX_BUSCAR_LIMIT = 100;
const DEFAULT_BUSCAR_LIMIT = 30;

function norm(v) {
  return (v || "").toString().trim().toLowerCase();
}

function matchesFilters(r, f) {
  if (f.area && norm(r.area) !== norm(f.area)) return false;
  if (f.estado && norm(r.estado) !== norm(f.estado)) return false;
  if (f.categoria && norm(r.categoria) !== norm(f.categoria)) return false;
  if (f.proveedor && !norm(r.proveedor).includes(norm(f.proveedor))) return false;
  if (f.medioPago && norm(r.medioPago) !== norm(f.medioPago)) return false;
  if (f.estadoLegalizacion && norm(r.estadoLegalizacion) !== norm(f.estadoLegalizacion)) return false;
  if (f.fechaDesde && (!r.fechaSolicitud || r.fechaSolicitud < f.fechaDesde)) return false;
  if (f.fechaHasta && (!r.fechaSolicitud || r.fechaSolicitud > f.fechaHasta)) return false;
  if (f.valorMin != null && (r.valorConIva || 0) < f.valorMin) return false;
  if (f.valorMax != null && (r.valorConIva || 0) > f.valorMax) return false;
  return true;
}

function compactRecordForChat(r) {
  return {
    fechaSolicitud: r.fechaSolicitud,
    fechaEntrega: r.fechaEntrega,
    area: r.area,
    responsable: r.responsable,
    estado: r.estado,
    categoria: r.categoria,
    descripcion: r.descripcion,
    medioPago: r.medioPago,
    estadoLegalizacion: r.estadoLegalizacion,
    proveedor: r.proveedor,
    valorConIva: r.valorConIva,
    valorSinIva: r.valorSinIva,
    radicado: r.radicado,
  };
}

// Presupuesto por área y año (modo "area": un total; modo "categoria":
// desglosado por categoría, el total del área es la suma) + lo gastado hasta
// ahora en cada uno. Solo cuenta registros no anulados, igual que el Dashboard.
function buildPresupuestoResumen(records, presupuestos, filters) {
  const gastadoPorAreaAnio = new Map();
  const gastadoPorAreaAnioCategoria = new Map();
  for (const r of records) {
    if (r.estado === "Anulado" || !r.fechaSolicitud) continue;
    const area = r.area || "Sin área";
    const anio = r.fechaSolicitud.slice(0, 4);
    const valor = r.valorConIva || 0;
    const keyArea = `${area}||${anio}`;
    gastadoPorAreaAnio.set(keyArea, (gastadoPorAreaAnio.get(keyArea) || 0) + valor);
    const categoria = r.categoria || "Sin categoría";
    const keyCat = `${keyArea}||${categoria}`;
    gastadoPorAreaAnioCategoria.set(keyCat, (gastadoPorAreaAnioCategoria.get(keyCat) || 0) + valor);
  }

  const areas = presupuestos
    .filter((p) => !filters.area || norm(p.area) === norm(filters.area))
    .filter((p) => !filters.anio || Number(p.anio) === Number(filters.anio))
    .map((p) => {
      const gastado = gastadoPorAreaAnio.get(`${p.area}||${String(p.anio)}`) || 0;
      const categorias = p.modo === "categoria"
        ? p.categorias.map((c) => {
            const g = gastadoPorAreaAnioCategoria.get(`${p.area}||${String(p.anio)}||${c.categoria}`) || 0;
            return { categoria: c.categoria, presupuesto: c.valor, gastado: g, disponible: c.valor - g };
          })
        : [];
      return {
        area: p.area,
        anio: p.anio,
        modo: p.modo,
        presupuestoTotal: p.total,
        gastadoAcumulado: gastado,
        disponible: p.total - gastado,
        pctConsumido: p.total ? Number(((gastado / p.total) * 100).toFixed(1)) : null,
        categorias,
      };
    });

  return {
    areas,
    nota: "Cada entrada tiene su propio año ('anio'). Si un área/año no aparece aquí, es porque no se le ha configurado presupuesto — dilo así, no asumas que es cero.",
  };
}

function buildAuditoriaResumen(logs) {
  return logs.map((l) => ({
    fecha: l.createdAt,
    accion: l.action,
    entidad: l.entityType,
    detalle: l.recordInfo,
    usuario: l.userNombre || l.userEmail || "(usuario eliminado)",
    cambios: l.changes,
  }));
}

// Definiciones (JSON Schema) enviadas a Anthropic — "tools" varía según
// permisos del rol (ver canSeePresupuesto/canSeeAuditoria en chat/route.js):
// las herramientas de presupuesto/auditoría ni siquiera se le ofrecen al
// modelo si el rol no tiene ese permiso, en vez de ofrecerlas y rechazarlas
// después — así nunca "sabe" que existen si no puede usarlas.
export function buildToolDefs({ canSeePresupuesto, canSeeAuditoria }) {
  const tools = [
    {
      name: "resumen_compras",
      description: "Cifras EXACTAS (sumas, conteos, promedios, porcentajes) calculadas sobre el 100% de los registros de compra que cumplan los filtros dados — totales por área/categoría/estado/proveedor, cumplimiento de tiempos de entrega, % de legalización, etc. Úsala SIEMPRE para cualquier pregunta de totales, promedios, distribución o \"análisis general\" — nunca sumes o calcules estos números tú mismo a partir de buscar_registros (esa es solo para citar ejemplos puntuales, no para agregados). Para comparar dos periodos (ej. \"2025 vs 2026\", \"este trimestre vs el anterior\"), llama esta misma herramienta UNA VEZ POR CADA periodo (con 'anio', o con 'fechaDesde'/'fechaHasta' si el periodo no es un año calendario completo) y compara tú los totales ya exactos que te devuelva cada llamada — no hace falta (ni debes) sumar registros individuales para esto.",
      input_schema: {
        type: "object",
        properties: {
          area: { type: "string", description: "Filtra solo por esta área (opcional, nombre exacto tal como aparece en los datos)." },
          anio: { type: "integer", description: "Filtra solo por año de la fecha de solicitud (opcional, ej. 2026). Se ignora si se envían fechaDesde/fechaHasta." },
          fechaDesde: { type: "string", description: "Fecha mínima de solicitud, formato YYYY-MM-DD (opcional) — úsala en vez de 'anio' para periodos que no son un año completo (trimestres, meses, rangos arbitrarios)." },
          fechaHasta: { type: "string", description: "Fecha máxima de solicitud, formato YYYY-MM-DD (opcional)." },
          categoria: { type: "string", description: "Filtra solo por esta categoría (opcional, nombre exacto)." },
          proveedor: { type: "string", description: "Filtra solo por este proveedor (opcional, coincidencia parcial, sin distinguir mayúsculas/minúsculas)." },
        },
      },
    },
    {
      name: "buscar_registros",
      description: "Busca registros de compra INDIVIDUALES que cumplan filtros específicos, para citar ejemplos puntuales (proveedor, descripción, montos, fechas) — NO la uses para calcular totales o porcentajes generales (para eso usa resumen_compras). Devuelve como máximo 'limit' registros (por defecto 30, máximo 100) ordenados del más reciente al más antiguo, más el total de coincidencias reales (que puede ser mayor a lo devuelto).",
      input_schema: {
        type: "object",
        properties: {
          area: { type: "string", description: "Nombre exacto del área (opcional)." },
          estado: { type: "string", description: "Nombre exacto del estado de la compra (opcional)." },
          categoria: { type: "string", description: "Nombre exacto de la categoría (opcional)." },
          proveedor: { type: "string", description: "Coincidencia parcial del nombre del proveedor (opcional)." },
          medioPago: { type: "string", description: "Nombre exacto del medio de pago (opcional)." },
          estadoLegalizacion: { type: "string", description: "Nombre exacto del estado de legalización (opcional)." },
          fechaDesde: { type: "string", description: "Fecha mínima de solicitud, formato YYYY-MM-DD (opcional)." },
          fechaHasta: { type: "string", description: "Fecha máxima de solicitud, formato YYYY-MM-DD (opcional)." },
          valorMin: { type: "number", description: "Valor con IVA mínimo en pesos colombianos (opcional)." },
          valorMax: { type: "number", description: "Valor con IVA máximo en pesos colombianos (opcional)." },
          limit: { type: "integer", description: "Máximo de registros a devolver (opcional, por defecto 30, máximo 100)." },
        },
      },
    },
  ];

  if (canSeePresupuesto) {
    tools.push({
      name: "resumen_presupuesto",
      description: "Presupuesto configurado por área y año (total, o desglosado por categoría según cómo se haya configurado) y cuánto lleva gastado cada una — solo para preguntas de presupuesto/gasto disponible.",
      input_schema: {
        type: "object",
        properties: {
          area: { type: "string", description: "Filtra solo por esta área (opcional, nombre exacto)." },
          anio: { type: "integer", description: "Filtra solo por este año (opcional, ej. 2026)." },
        },
      },
    });
  }

  if (canSeeAuditoria) {
    tools.push({
      name: "registro_auditoria",
      description: "Historial de auditoría (quién hizo qué, cuándo, sobre qué, y qué campos cambiaron) para registros de compra, maestros, usuarios, presupuestos o permisos.",
      input_schema: {
        type: "object",
        properties: {
          usuario: { type: "string", description: "Filtra por nombre o correo del usuario que hizo la acción (opcional, coincidencia parcial)." },
          entidad: { type: "string", description: "Filtra por tipo de entidad afectada, ej. \"record\", \"user\", \"presupuesto\" (opcional, coincidencia parcial)." },
          desde: { type: "string", description: "Fecha mínima, formato YYYY-MM-DD (opcional)." },
          hasta: { type: "string", description: "Fecha máxima, formato YYYY-MM-DD (opcional)." },
          limit: { type: "integer", description: "Máximo de movimientos a devolver (opcional, por defecto 50, máximo 200)." },
        },
      },
    });
  }

  return tools;
}

// Fábrica del ejecutor: "records"/"presupuestos" se cargan como mucho una vez
// por request de chat (memoizados aquí), sin importar cuántas veces el modelo
// llame a una herramienta que los necesite en la misma conversación-turno.
export function buildToolExecutor({ canSeePresupuesto, canSeeAuditoria }) {
  let recordsPromise = null;
  const getRecords = () => (recordsPromise ??= listRecords());

  let presupuestosPromise = null;
  const getPresupuestos = () => (presupuestosPromise ??= listPresupuestos().then((r) => r.presupuestos));

  return async function executeTool(name, input) {
    const args = input || {};
    switch (name) {
      case "resumen_compras": {
        const records = await getRecords();
        // fechaDesde/fechaHasta explícitos tienen prioridad sobre "anio" —
        // permite comparar periodos que no son un año calendario completo
        // (trimestres, meses, rangos arbitrarios), no solo año contra año.
        const filtered = records.filter((r) => matchesFilters(r, {
          area: args.area, categoria: args.categoria, proveedor: args.proveedor,
          fechaDesde: args.fechaDesde || (args.anio ? `${args.anio}-01-01` : undefined),
          fechaHasta: args.fechaHasta || (args.anio ? `${args.anio}-12-31` : undefined),
        }));
        const presupuestos = canSeePresupuesto ? await getPresupuestos() : [];
        const aggregates = buildAggregates(filtered, presupuestos);
        if (!canSeePresupuesto) delete aggregates.presupuesto;
        return aggregates;
      }
      case "buscar_registros": {
        const records = await getRecords();
        const limit = Math.max(1, Math.min(MAX_BUSCAR_LIMIT, Number(args.limit) || DEFAULT_BUSCAR_LIMIT));
        const matches = records.filter((r) => matchesFilters(r, args));
        const ordenados = [...matches].reverse(); // listRecords ya viene asc por fechaSolicitud
        return {
          totalCoincidencias: matches.length,
          registrosDevueltos: Math.min(limit, ordenados.length),
          registros: ordenados.slice(0, limit).map(compactRecordForChat),
        };
      }
      case "resumen_presupuesto": {
        if (!canSeePresupuesto) return { error: "No autorizado para consultar presupuesto." };
        const [records, presupuestos] = await Promise.all([getRecords(), getPresupuestos()]);
        return buildPresupuestoResumen(records, presupuestos, args);
      }
      case "registro_auditoria": {
        if (!canSeeAuditoria) return { error: "No autorizado para consultar auditoría." };
        const limit = Math.max(1, Math.min(200, Number(args.limit) || 50));
        const { logs } = await listAuditLogs({ from: args.desde, to: args.hasta, pageSize: 300 });
        const filtered = logs.filter((l) => {
          if (args.usuario) {
            const hay = norm(l.userNombre).includes(norm(args.usuario)) || norm(l.userEmail).includes(norm(args.usuario));
            if (!hay) return false;
          }
          if (args.entidad && !norm(l.entityType).includes(norm(args.entidad))) return false;
          return true;
        });
        return {
          totalCoincidencias: filtered.length,
          movimientosDevueltos: Math.min(limit, filtered.length),
          movimientos: buildAuditoriaResumen(filtered.slice(0, limit)),
        };
      }
      default:
        return { error: `Herramienta desconocida: ${name}` };
    }
  };
}
