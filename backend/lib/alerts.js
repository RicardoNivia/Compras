import { listRecords } from "@/lib/records";
import { listPresupuestos } from "@/lib/presupuestos";
import { businessDaysBetween, businessDaysElapsedToToday } from "@/lib/businessDays";

// Mismo umbral que el Dashboard (KPI "Cumplimiento de tiempos") y los
// Informes automáticos — una sola definición de "a tiempo" en todo el panel.
const SLA_DIAS_HABILES = 8;
const PRESUPUESTO_ALERTA_PCT = 80;
const PRESUPUESTO_CRITICO_PCT = 90;

function isPendienteSinEntrega(r) {
  if (r.fechaEntrega) return false;
  const estado = (r.estado || "").trim();
  return estado === "" || estado === "Proceso" || estado === "Pendiente";
}

function miniFields(r, extra) {
  return {
    id: r.id,
    localSeq: r.localSeq,
    informe: r.informe,
    descripcion: r.descripcion,
    area: r.area,
    responsable: r.responsable,
    proveedor: r.proveedor,
    estado: r.estado,
    valorConIva: r.valorConIva,
    fechaSolicitud: r.fechaSolicitud,
    fechaEntrega: r.fechaEntrega,
    observaciones: r.observaciones,
    ...extra,
  };
}

// Solicitudes sin entregar aún, ordenadas por días hábiles transcurridos
// (más atrasadas primero) — misma lógica que la tabla "Solicitudes
// pendientes" del Dashboard (DashboardView.jsx).
export async function getSolicitudesPendientes(records) {
  const pendientes = records.filter(isPendienteSinEntrega).map((r) => {
    const dias = businessDaysElapsedToToday(r.fechaSolicitud);
    return miniFields(r, { diasHabiles: dias ?? -1, vencido: dias != null && dias > SLA_DIAS_HABILES });
  });
  return pendientes.sort((a, b) => b.diasHabiles - a.diasHabiles);
}

// % del presupuesto anual ya gastado por área (año actual), de mayor a
// menor — para detectar qué áreas están más cerca de agotar o ya excedieron
// su presupuesto. Reutiliza los mismos umbrales 80%/90% del Dashboard.
export async function getRiesgoPresupuesto(records) {
  const anio = new Date().getFullYear();
  const { presupuestos } = await listPresupuestos({ anio });
  const filas = presupuestos.map((p) => {
    const gastado = records
      .filter((r) => r.area === p.area && Number((r.fechaSolicitud || "").slice(0, 4)) === anio)
      .reduce((s, r) => s + (r.valorConIva || 0), 0);
    const porcentaje = p.total > 0 ? Math.round((gastado / p.total) * 1000) / 10 : null;
    const estado = porcentaje == null ? "sin-datos" : porcentaje >= PRESUPUESTO_CRITICO_PCT ? "excedido" : porcentaje >= PRESUPUESTO_ALERTA_PCT ? "alerta" : "ok";
    return { area: p.area, anio, presupuestado: p.total, gastado, porcentaje, estado };
  });
  return filas.sort((a, b) => (b.porcentaje ?? -1) - (a.porcentaje ?? -1));
}

// Compras (entregadas o aún pendientes) cuyo tiempo de solicitud a entrega ya
// superó el SLA de 8 días hábiles — las "peores" primero. Combina entregadas
// tardías y pendientes ya vencidas, igual que el bloque de "offenders" del
// Dashboard (Tiempos de solicitud a entrega).
export async function getRiesgoTiempos(records) {
  const items = [];
  for (const r of records) {
    if (!r.fechaSolicitud) continue;
    if (r.fechaEntrega) {
      const dias = businessDaysBetween(r.fechaSolicitud, r.fechaEntrega);
      if (dias != null && dias > SLA_DIAS_HABILES) {
        items.push(miniFields(r, { diasHabiles: dias, entregado: true }));
      }
    } else if (isPendienteSinEntrega(r)) {
      const dias = businessDaysElapsedToToday(r.fechaSolicitud);
      if (dias != null && dias > SLA_DIAS_HABILES) {
        items.push(miniFields(r, { diasHabiles: dias, entregado: false }));
      }
    }
  }
  return items.sort((a, b) => b.diasHabiles - a.diasHabiles);
}

// Compras ya legalizadas pero que todavía no se han radicado — el último
// paso del trámite sigue pendiente (una vez "Legalizado" y radicado, ya no
// requiere más seguimiento). Ordenadas por fecha de solicitud, las más
// antiguas primero (las que más tiempo llevan esperando ese último paso).
function getNoRadicadas(records) {
  const items = records
    .filter((r) => r.estadoLegalizacion === "Legalizado" && !r.radicado)
    .map((r) => miniFields(r));
  return items.sort((a, b) => (a.fechaSolicitud || "").localeCompare(b.fechaSolicitud || ""));
}

// Datos crudos para la página /alertas y para el prompt de "Revisar con IA"
// (ver app/api/agent/review-alertas/route.js) — ambos deben partir de
// exactamente los mismos registros/cálculos para que el análisis de la IA
// coincida con lo que el usuario ve en pantalla.
export async function getAlertsData() {
  const records = await listRecords();
  const [solicitudesPendientes, riesgoPresupuesto, riesgoTiempos] = await Promise.all([
    getSolicitudesPendientes(records),
    getRiesgoPresupuesto(records),
    getRiesgoTiempos(records),
  ]);
  const noRadicadas = getNoRadicadas(records);
  return { solicitudesPendientes, riesgoPresupuesto, riesgoTiempos, noRadicadas };
}
