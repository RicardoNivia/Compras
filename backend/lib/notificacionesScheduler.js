import { prisma } from "@/lib/prisma";
import { ymd } from "@/lib/reportSchedule";
import { esDiaDeEnvio } from "@/lib/notificaciones";
import { ejecutarNotificacion, reintentarTeams } from "@/lib/notificacionesMotor";
import { procesarEventos, detectarValoraciones, lotesPendientes, purgarEventos } from "@/lib/notificacionesEventos";

// Programador de las notificaciones configurables (mismo patrón que lib/reportScheduler.js): cada minuto revisa
// las activas que tocan hoy y, a partir de su hora, las ejecuta. Una sola vez por día gracias a la clave única de
// la ejecución ("n{id}|{día}"), aunque el servidor se reinicie. Si arranca tarde el mismo día, la envía igual,
// marcada como "recuperada" con el retraso; los días que pasaron completos con el servidor apagado no se recuperan
// (llegarían datos viejos). La hora es la del servidor: en producción debe correr con TZ=America/Bogota.
//
// También reintenta los envíos de Teams que fallaron por un error temporal y, una vez al día, purga el historial
// de más de 180 días.

const CHECK_INTERVAL_MS = 60 * 1000;
const RETRASO_RECUPERADO_MIN = 30;
const RETENCION_DIAS = 180;

const enCurso = globalThis.__notificacionesEnCurso || (globalThis.__notificacionesEnCurso = new Set());

async function ejecutarPendientes() {
  let activas;
  try {
    activas = await prisma.notificacion.findMany({ where: { estado: "activa", disparador: "programado" }, select: { id: true, frecuencia: true, diaSemana: true, diaMes: true, ordinal: true, fechaUnica: true, hora: true, siFestivo: true, sabadoHabil: true, domingoHabil: true } });
  } catch {
    return; // BD no disponible en este tick: se reintenta en el siguiente
  }
  const ahora = new Date();
  const minutos = ahora.getHours() * 60 + ahora.getMinutes();
  for (const n of activas) {
    if (enCurso.has(n.id) || !n.hora || !n.frecuencia) continue;
    const [h, m] = n.hora.split(":").map(Number);
    if (minutos < h * 60 + m) continue;
    if (!esDiaDeEnvio(n, ahora)) continue;
    const yaHoy = await prisma.notificacionEjecucion.findUnique({ where: { clave: `n${n.id}|${ymd(ahora)}` }, select: { id: true } }).catch(() => ({ id: 0 }));
    if (yaHoy) continue;

    const retraso = minutos - (h * 60 + m);
    enCurso.add(n.id);
    ejecutarNotificacion(n.id, { origen: retraso > RETRASO_RECUPERADO_MIN ? "recuperado" : "programado", retrasoMin: retraso > RETRASO_RECUPERADO_MIN ? retraso : null, ahora })
      .catch((e) => console.error(`[notificaciones] ${n.id}: ${e?.message || e}`))
      .finally(() => enCurso.delete(n.id));
  }
}

async function purgar() {
  const hoy = ymd(new Date());
  if (globalThis.__notificacionesPurga === hoy) return;
  globalThis.__notificacionesPurga = hoy;
  const limite = new Date(Date.now() - RETENCION_DIAS * 86400000);
  await prisma.notificacionEjecucion.deleteMany({ where: { createdAt: { lt: limite } } }).catch(() => {});
  await prisma.notificacionEntrega.deleteMany({ where: { ejecucionId: null, createdAt: { lt: limite } } }).catch(() => {});
  await purgarEventos();
}

export function startNotificacionesScheduler() {
  if (globalThis.__notificacionesSchedulerStarted) return;
  globalThis.__notificacionesSchedulerStarted = true;
  if (!process.env.TZ && process.env.NODE_ENV === "production") {
    console.warn("[notificaciones] TZ no está definida: las horas programadas usan la zona del servidor. Define TZ=America/Bogota.");
  }
  if (!process.env.APP_URL && process.env.NODE_ENV === "production") {
    console.warn("[notificaciones] APP_URL no está definida: los botones de las tarjetas de Teams apuntarán a http://localhost:3000. Define APP_URL con la dirección del panel en el backend.");
  }
  setInterval(() => {
    ejecutarPendientes().catch(() => {});
    // Fase 2: eventos. Las valoraciones se detectan por barrido (las guarda la app, el proceso automático o un script).
    detectarValoraciones().then(procesarEventos).catch(() => {});
    lotesPendientes(new Date(), esDiaDeEnvio).catch(() => {});
    reintentarTeams().catch(() => {});
    purgar().catch(() => {});
  }, CHECK_INTERVAL_MS);
}
