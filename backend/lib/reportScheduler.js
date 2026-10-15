import { prisma } from "@/lib/prisma";
import { esFechaDeEnvio } from "@/lib/reportSchedule";
import { generarEdicion } from "@/lib/reportEdiciones";

const CHECK_INTERVAL_MS = 60 * 1000;

// No hay un cron externo en este stack: mientras el proceso de Next.js del backend esté corriendo, este intervalo
// revisa cada minuto qué informes activos tocan hoy (ver lib/reportSchedule.js: frecuencias, días hábiles y festivos)
// y, a partir de su hora, genera la edición del día (ver lib/reportEdiciones.js). Ya no depende del correo: sin SMTP
// la edición queda "por enviar" y le llega al responsable en Mi día ("Lo envío yo"); con correo automático
// habilitado y el informe configurado así, se envía sola.
// "A partir de su hora" (no "exactamente a esa hora"): si el servidor estaba apagado a las 8:00 y arranca a las 9:10,
// la edición de hoy se genera igual. Nunca dos el mismo día: se mira si ya existe una edición programada de hoy.

const enCurso = globalThis.__reportesEnCurso || (globalThis.__reportesEnCurso = new Set());

function inicioDelDia(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

async function runDueReports() {
  let reports;
  try {
    // Solo informes del Estudio: los del constructor anterior quedan sin programar hasta que se abran y se activen
    // de nuevo en el Estudio (así no empiezan a aparecer de golpe en Mi día informes que nadie revisó).
    reports = await prisma.reportConfig.findMany({ where: { activo: true, esBorrador: false, tipo: "estudio" } });
  } catch {
    return; // BD no disponible en este tick: se reintenta en el siguiente
  }

  const now = new Date();
  const minutos = now.getHours() * 60 + now.getMinutes();
  for (const report of reports) {
    if (enCurso.has(report.id)) continue;
    const [h, m] = String(report.hora || "08:00").split(":").map(Number);
    if (minutos < h * 60 + m) continue;
    if (!esFechaDeEnvio(report, now)) continue;

    // Los informes solo para consultar no se envían: a su hora se les guarda una foto automática en su histórico.
    const consulta = (() => { try { return JSON.parse(report.contexto || "{}").proposito === "consulta"; } catch { return false; } })();
    const yaHoy = await prisma.reportEdicion.count({
      where: { reportId: report.id, creadoPorUserId: null, origen: consulta ? "foto" : "programado", createdAt: { gte: inicioDelDia(now) } },
    }).catch(() => 1);
    if (yaHoy) continue;

    enCurso.add(report.id);
    generarEdicion(report, { origen: consulta ? "foto" : "programado" })
      .catch(() => {})
      .finally(() => enCurso.delete(report.id));
  }
}

export function startReportScheduler() {
  if (globalThis.__reportSchedulerStarted) return;
  globalThis.__reportSchedulerStarted = true;
  setInterval(() => { runDueReports().catch(() => {}); }, CHECK_INTERVAL_MS);
}
