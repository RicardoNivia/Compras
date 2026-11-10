import { businessDaysBetween, businessDaysElapsedToToday } from "@/lib/businessDays";

// Calcula la información de "días hábiles" de un registro (usado en tabla, modal
// de detalle, modal de edición y dashboard). Replica la lógica del panel original:
// - Si hay fecha de entrega: días hábiles entre solicitud y entrega. <=8 = good, >8 = critical.
// - Si no hay fecha de entrega: días hábiles transcurridos hasta hoy. >8 (y no Anulado) = warning, si no muted.
export function getDiasInfo(record) {
  const { fechaSolicitud, fechaEntrega, estado } = record || {};

  if (fechaEntrega) {
    const dias = businessDaysBetween(fechaSolicitud, fechaEntrega);
    if (dias === null) {
      return { dias: null, label: "—", severity: "muted", pending: false };
    }
    const severity = dias <= 8 ? "good" : "critical";
    return { dias, label: `${dias} d.`, severity, pending: false };
  }

  const dias = businessDaysElapsedToToday(fechaSolicitud);
  if (dias === null) {
    return { dias: null, label: "—", severity: "muted", pending: true };
  }
  const isWarning = dias > 8 && estado !== "Anulado";
  return {
    dias,
    label: `${dias} d. · pend.`,
    severity: isWarning ? "warning" : "muted",
    pending: true,
  };
}
