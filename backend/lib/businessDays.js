// Utilidades de días hábiles y festivos de Colombia, portadas 1:1 del panel original.
// Copia exacta de frontend/lib/businessDays.js (sin dependencias de Prisma/Node,
// se duplica igual que lib/roles.js — ver CLAUDE.md) para que los "tiempos de
// solicitud a entrega" de los Informes automáticos usen la misma definición
// de días hábiles que el Dashboard.

export const FESTIVOS_2026 = [
  "2026-01-01", "2026-01-12", "2026-03-23", "2026-04-02", "2026-04-03",
  "2026-05-01", "2026-05-18", "2026-06-08", "2026-06-15", "2026-06-29",
  "2026-07-13", "2026-07-20", "2026-08-07", "2026-08-17", "2026-10-12",
  "2026-11-02", "2026-11-16", "2026-12-08", "2026-12-25",
];

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toISO(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

// Si el día es lunes devuelve la misma fecha; si no, avanza al siguiente lunes.
export function nextMonday(date) {
  const d = new Date(date.getTime());
  const wd = d.getDay();
  const add = wd === 1 ? 0 : ((8 - wd) % 7 || 7);
  d.setDate(d.getDate() + add);
  return d;
}

// Algoritmo de Meeus/Jones/Butcher para el domingo de Pascua (calendario gregoriano).
export function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

const holidayCache = new Map();

export function computeHolidaysForYear(year) {
  if (year === 2026) return FESTIVOS_2026;
  if (holidayCache.has(year)) return holidayCache.get(year);

  const easter = easterSunday(year);
  const addDays = (date, n) => {
    const d = new Date(date.getTime());
    d.setDate(d.getDate() + n);
    return d;
  };

  const fixed = [
    new Date(year, 0, 1), // Año nuevo
    nextMonday(new Date(year, 0, 6)), // Reyes
    nextMonday(new Date(year, 2, 19)), // San José
    addDays(easter, -3), // Jueves Santo
    addDays(easter, -2), // Viernes Santo
    new Date(year, 4, 1), // Trabajo
    nextMonday(addDays(easter, 39)), // Ascensión
    nextMonday(addDays(easter, 60)), // Corpus Christi
    nextMonday(addDays(easter, 68)), // Sagrado Corazón
    nextMonday(new Date(year, 5, 29)), // San Pedro y San Pablo
    new Date(year, 6, 20), // Independencia
    new Date(year, 7, 7), // Boyacá
    nextMonday(new Date(year, 7, 15)), // Asunción
    nextMonday(new Date(year, 9, 12)), // Día de la Raza
    nextMonday(new Date(year, 10, 1)), // Todos los Santos
    nextMonday(new Date(year, 10, 11)), // Independencia de Cartagena
    new Date(year, 11, 8), // Inmaculada Concepción
    new Date(year, 11, 25), // Navidad
  ];

  const isoList = fixed.map(toISO);
  holidayCache.set(year, isoList);
  return isoList;
}

export function isHoliday(dateObj) {
  const year = dateObj.getFullYear();
  const holidays = computeHolidaysForYear(year);
  return holidays.includes(toISO(dateObj));
}

function parseISODate(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function businessDaysBetween(startISO, endISO) {
  if (!startISO || !endISO) return null;
  const start = parseISODate(startISO);
  const end = parseISODate(endISO);
  if (!start || !end) return null;
  if (end < start) return null;

  let count = 0;
  const d = new Date(start.getTime());
  while (d < end) {
    d.setDate(d.getDate() + 1);
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6 && !isHoliday(d)) {
      count++;
    }
  }
  return count;
}

export function businessDaysElapsedToToday(startISO) {
  const todayISO = toISO(new Date());
  return businessDaysBetween(startISO, todayISO);
}
