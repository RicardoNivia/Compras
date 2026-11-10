import { isHoliday } from "@/lib/businessDays";

// Reglas de programación de los informes (Estudio de informes). Puro: sin BD ni red, lo usan el programador
// (lib/reportScheduler.js), la API de "próximas fechas" y la lista de informes.
//
// Frecuencias:
//   diaria          → cada día hábil
//   semanal         → el día de la semana `diaSemana` (0 = domingo .. 6 = sábado)
//   mensual         → el día `diaMes` del mes (31 = fin de mes)
//   mensual_semana  → el `ordinal`-ésimo (1..4, -1 = último) `diaSemana` HÁBIL del mes ("el primer lunes hábil")
//   ultimo_habil    → el último día hábil del mes
//   unica           → solo una vez, la fecha `fechaUnica` (YYYY-MM-DD)
// Con `saltarFestivos` (por defecto sí), una fecha que cae en festivo colombiano o en fin de semana no hábil se corre
// al siguiente día hábil; en "mensual_semana" se toma el siguiente `diaSemana` que sí sea hábil.

export const FRECUENCIAS = ["diaria", "semanal", "mensual", "mensual_semana", "ultimo_habil", "unica"];
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const ORDINALES = { 1: "primer", 2: "segundo", 3: "tercer", 4: "cuarto", "-1": "último" };

export function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dia(y, m, d) {
  return new Date(y, m, d);
}

export function esHabil(d, report) {
  const wd = d.getDay();
  if (wd === 6 && !report.sabadoHabil) return false;
  if (wd === 0 && !report.domingoHabil) return false;
  if (report.saltarFestivos !== false && isHoliday(d)) return false;
  return true;
}

function siguienteHabil(d, report) {
  const x = new Date(d.getTime());
  for (let i = 0; i < 15 && !esHabil(x, report); i++) x.setDate(x.getDate() + 1);
  return x;
}

// Fecha de generación de este informe en el mes de `ref` (o null si la frecuencia no es mensual).
function fechaDelMes(report, ref) {
  const y = ref.getFullYear();
  const m = ref.getMonth();
  const ultimo = new Date(y, m + 1, 0).getDate();
  if (report.frecuencia === "mensual") {
    const base = dia(y, m, Math.min(report.diaMes || 1, ultimo));
    return report.saltarFestivos === false ? base : siguienteHabil(base, report);
  }
  if (report.frecuencia === "ultimo_habil") {
    for (let d = ultimo; d >= 1; d--) {
      const x = dia(y, m, d);
      if (esHabil(x, report)) return x;
    }
    return null;
  }
  if (report.frecuencia === "mensual_semana") {
    const wd = report.diaSemana ?? 1;
    const candidatos = [];
    for (let d = 1; d <= ultimo; d++) {
      const x = dia(y, m, d);
      if (x.getDay() === wd && (report.saltarFestivos === false || esHabil(x, report))) candidatos.push(x);
    }
    if (!candidatos.length) return null;
    const ord = report.ordinal || 1;
    return ord === -1 ? candidatos[candidatos.length - 1] : candidatos[ord - 1] || null;
  }
  return null;
}

// ¿Este día (solo la fecha, sin hora) es un día de generación del informe?
export function esFechaDeEnvio(report, d) {
  const key = ymd(d);
  switch (report.frecuencia) {
    case "unica":
      return report.fechaUnica === key;
    case "diaria":
      return esHabil(d, report);
    case "semanal": {
      // El día de la semana configurado de esa semana, corrido al siguiente hábil si hace falta.
      const base = new Date(d.getTime());
      base.setDate(base.getDate() - ((d.getDay() - (report.diaSemana ?? 1) + 7) % 7));
      const objetivo = report.saltarFestivos === false ? base : siguienteHabil(base, report);
      return ymd(objetivo) === key;
    }
    case "mensual":
    case "mensual_semana":
    case "ultimo_habil": {
      const f = fechaDelMes(report, d);
      if (f && ymd(f) === key) return true;
      // Una fecha de fin de mes corrida por festivo puede caer en el mes siguiente.
      const prev = fechaDelMes(report, new Date(d.getFullYear(), d.getMonth() - 1, 1));
      return !!(prev && ymd(prev) === key);
    }
    default:
      return false;
  }
}

// Próximas `n` fechas de generación a partir de `desde` (incluido hoy si la hora aún no pasó).
export function proximasFechas(report, n = 5, desde = new Date()) {
  const out = [];
  const [h, mi] = String(report.hora || "08:00").split(":").map(Number);
  const cursor = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate());
  const yaPasoHoy = desde.getHours() * 60 + desde.getMinutes() >= h * 60 + mi;
  if (yaPasoHoy) cursor.setDate(cursor.getDate() + 1);
  for (let i = 0; i < 800 && out.length < n; i++) {
    if (esFechaDeEnvio(report, cursor)) {
      const f = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), h, mi);
      // Si la fecha "natural" era festiva, se explica por qué se corrió.
      out.push({ fecha: f.toISOString(), dia: ymd(cursor), nota: notaCorrimiento(report, cursor) });
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

function notaCorrimiento(report, d) {
  if (report.frecuencia === "mensual_semana" && (report.ordinal || 1) > 0) {
    // ¿Hubo un día igual antes en el mes que se saltó por festivo?
    for (let x = 1; x < d.getDate(); x++) {
      const prev = new Date(d.getFullYear(), d.getMonth(), x);
      if (prev.getDay() === d.getDay() && isHoliday(prev)) return `el ${x} es festivo`;
    }
  }
  if (report.frecuencia === "mensual" && report.diaMes && report.diaMes !== d.getDate()) return `el ${report.diaMes} no es hábil`;
  return null;
}

export function describirProgramacion(report) {
  const hora = formatoHora(report.hora);
  switch (report.frecuencia) {
    case "diaria": return `Cada día hábil · ${hora}`;
    case "semanal": return `Cada ${DIAS[report.diaSemana ?? 1]} · ${hora}`;
    case "mensual": return report.diaMes >= 31 ? `Fin de cada mes · ${hora}` : `El ${report.diaMes} de cada mes · ${hora}`;
    case "mensual_semana": return `${cap(ORDINALES[report.ordinal || 1] || "primer")} ${DIAS[report.diaSemana ?? 1]} hábil de cada mes · ${hora}`;
    case "ultimo_habil": return `Último día hábil del mes · ${hora}`;
    case "unica": {
      if (!report.fechaUnica) return `Una sola vez · ${hora}`;
      const [y, m, d] = report.fechaUnica.split("-").map(Number);
      return `Una sola vez, el ${d} de ${MESES[m - 1]} de ${y} · ${hora}`;
    }
    default: return "Sin programar";
  }
}

function cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export function formatoHora(hhmm) {
  const [h, m] = String(hhmm || "08:00").split(":").map(Number);
  const suf = h < 12 ? "a. m." : "p. m.";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suf}`;
}

// Etiqueta legible del período de datos de una generación hecha en `now`.
export function periodoLabel(periodoGeneral, now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth();
  const capM = (i) => cap(MESES[(i + 12) % 12]);
  switch (periodoGeneral) {
    case "mes_actual": return `${capM(m)} ${y}`;
    case "mes_anterior": { const d = new Date(y, m - 1, 1); return `${capM(d.getMonth())} ${d.getFullYear()}`; }
    case "anio_actual": return `${y} a la fecha`;
    case "anio_anterior": return String(y - 1);
    case "semana_anterior": return "Semana anterior";
    default: return "Histórico";
  }
}

export { MESES, DIAS };
