import { prisma } from "@/lib/prisma";
import { generateReportContent } from "@/lib/reportContent";
import { generateReportPdfBuffer } from "@/lib/reportPdf";
import { resolveEmailBody } from "@/lib/reportEmailBody";
import { sendReportEmail, isMailerConfigured, MAIL_MAINTENANCE } from "@/lib/mailer";
import { markSent } from "@/lib/reports";
import { logReportSent } from "@/lib/audit";

const CHECK_INTERVAL_MS = 60 * 1000;

// Último día real del mes de "now" (ej. 28/29 en febrero, 30 en abril/junio/
// septiembre/noviembre, 31 en el resto) — día 0 del mes siguiente.
function lastDayOfMonth(now) {
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
}

// El día configurado se "recorta" al último día real del mes: así elegir 31
// funciona como "fin de mes" todo el año (30 en meses de 30 días, el 28/29 en
// febrero) en vez de nunca disparar en los meses que no llegan a ese día.
function effectiveMonthDay(diaMes, now) {
  return Math.min(diaMes, lastDayOfMonth(now));
}

function dateKey(d) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// Sábado y domingo se configuran por separado (uno puede ser hábil y el otro
// no, ver sabadoHabil/domingoHabil en el informe) — un día entre semana
// siempre es hábil.
function esHabil(d, report) {
  const wd = d.getDay();
  if (wd === 6) return !!report.sabadoHabil;
  if (wd === 0) return !!report.domingoHabil;
  return true;
}

// Si el día cae en uno no hábil, avanza de a un día hasta encontrar el
// siguiente que sí lo sea (nunca más de 2 pasos, dado que solo sábado/domingo
// pueden ser no hábiles).
function shiftToBusinessDay(d, report) {
  const shifted = new Date(d.getTime());
  while (!esHabil(shifted, report)) shifted.setDate(shifted.getDate() + 1);
  return shifted;
}

// Fecha "objetivo" de este informe para el período que contiene a "now"
// (hoy, para diaria; el día de la semana más cercano, para semanal; el día
// del mes efectivo, para mensual), ya ajustada al siguiente hábil si
// corresponde — isDue solo compara esta fecha contra "now" por día calendario.
function scheduledDateFor(report, now) {
  if (report.frecuencia === "semanal") {
    const base = new Date(now.getTime());
    base.setDate(base.getDate() + (report.diaSemana - now.getDay()));
    return shiftToBusinessDay(base, report);
  }
  if (report.frecuencia === "mensual") {
    const base = new Date(now.getFullYear(), now.getMonth(), effectiveMonthDay(report.diaMes, now));
    return shiftToBusinessDay(base, report);
  }
  return shiftToBusinessDay(now, report); // "diaria"
}

// No hay un cron externo en este stack — mientras el proceso de Next.js del
// backend esté corriendo (npm run dev / npm start), este intervalo revisa
// cada minuto qué informes activos están "vencidos" según su frecuencia/hora
// configurada y los envía. Es deliberadamente simple (sin node-cron) para no
// agregar una dependencia nueva solo para esto.
function isDue(report, now) {
  const [h, m] = report.hora.split(":").map(Number);
  if (now.getHours() !== h || now.getMinutes() !== m) return false;

  if (dateKey(scheduledDateFor(report, now)) !== dateKey(now)) return false;

  // Ya se envió hoy (evita reenvíos durante el mismo minuto si el intervalo
  // se solapa, o si el servidor se reinicia dentro de la ventana).
  const last = report.ultimoEnvio ? new Date(report.ultimoEnvio) : null;
  if (last && dateKey(last) === dateKey(now)) return false;

  return true;
}

async function runDueReports() {
  if (MAIL_MAINTENANCE || !isMailerConfigured()) return;
  let due;
  try {
    due = await prisma.reportConfig.findMany({ where: { activo: true, esBorrador: false } });
  } catch {
    return; // BD no disponible en este tick — se reintenta en el siguiente
  }

  const now = new Date();
  for (const report of due) {
    if (!isDue(report, now)) continue;
    try {
      const content = await generateReportContent({ prompt: report.prompt, bloques: report.bloques, nombre: report.nombre, periodoGeneral: report.periodoGeneral });
      const [pdfBuffer, cuerpo] = await Promise.all([
        generateReportPdfBuffer(content, { nombre: report.nombre, prioridad: report.prioridad, dashboardLayout: report.tipo === "dashboard" }),
        resolveEmailBody({ cuerpoHtml: report.cuerpoHtml, content, nombre: report.nombre, cuerpoModo: report.cuerpoModo, cuerpoPrompt: report.cuerpoPrompt }),
      ]);
      const destinatarios = JSON.parse(report.destinatarios || "[]");
      const cc = JSON.parse(report.cc || "[]");
      await sendReportEmail({
        to: destinatarios,
        cc,
        subject: content.asunto || report.nombre,
        text: cuerpo.text,
        html: cuerpo.html,
        attachments: [{ filename: `${report.nombre || "Informe"}.pdf`, content: pdfBuffer, contentType: "application/pdf" }],
      });
      await markSent(report.id, content, cuerpo.text);
      await logReportSent(null, report, true).catch(() => {});
    } catch (err) {
      await logReportSent(null, report, false, err.message).catch(() => {});
    }
  }
}

export function startReportScheduler() {
  if (globalThis.__reportSchedulerStarted) return;
  globalThis.__reportSchedulerStarted = true;
  setInterval(() => { runDueReports().catch(() => {}); }, CHECK_INTERVAL_MS);
}
