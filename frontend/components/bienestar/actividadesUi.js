// Catálogos y helpers de presentación del módulo de Bienestar, compartidos por la tabla, el cronograma y el modal.
// Los estados y las líneas deben coincidir con backend/lib/actividadesBienestar.js (ESTADOS, LINEAS).

// Semáforo de estados con colores propios y fijos (no cambian con el tema del módulo, que en Bienestar es verde):
// gris = creada (sin planear), azul = programada, ámbar = ejecutada, verde = cerrada. Ver .pill.est-* en globals.css.
export const ESTADOS_ACTIVIDAD = [
  { value: "creada", label: "Creada", pill: "est-creada" },
  { value: "programada", label: "Programada", pill: "est-programada" },
  { value: "ejecutada", label: "Ejecutada", pill: "est-ejecutada" },
  { value: "cerrada", label: "Cerrada", pill: "est-cerrada" },
];

export const LINEAS_ACTIVIDAD = ["Bienestar", "Fundación"];

export function estadoActividad(value) {
  return ESTADOS_ACTIVIDAD.find((e) => e.value === value) || { value, label: value || "—", pill: "est-creada" };
}

// Color del gasto contra el presupuesto: hasta 80 % bien, de 80 % a 100 % atención, más de 100 % excedido.
export function pctClase(pct) {
  if (pct == null) return "muted";
  if (pct > 1) return "critical";
  if (pct >= 0.8) return "warning";
  return "good";
}

export const DIAS_SEMANA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

// Fecha de una actividad para mostrar: "2026-06-04", o "2026-06-04 → 2026-06-07" si dura varios días.
export function rangoFechas(a) {
  if (!a?.fecha) return "Sin fecha";
  return a.fechaFin ? `${a.fecha} → ${a.fechaFin}` : a.fecha;
}

// ¿La actividad cae en este día (aaaa-mm-dd)? Las de varios días aparecen en todos sus días.
export function ocurreEl(a, iso) {
  if (!a?.fecha) return false;
  return iso >= a.fecha && iso <= (a.fechaFin || a.fecha);
}

const MES_ABREV = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const partes = (iso) => ({ a: Number(iso.slice(0, 4)), m: Number(iso.slice(5, 7)) - 1, d: Number(iso.slice(8, 10)) });

// "4 jun 2026", "10 al 13 dic 2026", "28 nov al 2 dic 2026". Las fechas son texto aaaa-mm-dd: sin zona horaria.
export function rangoHumano(a) {
  if (!a?.fecha) return "Sin fecha";
  const i = partes(a.fecha);
  if (!a.fechaFin || a.fechaFin === a.fecha) return `${i.d} ${MES_ABREV[i.m]} ${i.a}`;
  const f = partes(a.fechaFin);
  if (i.a !== f.a) return `${i.d} ${MES_ABREV[i.m]} ${i.a} al ${f.d} ${MES_ABREV[f.m]} ${f.a}`;
  return i.m === f.m ? `${i.d} al ${f.d} ${MES_ABREV[f.m]} ${f.a}` : `${i.d} ${MES_ABREV[i.m]} al ${f.d} ${MES_ABREV[f.m]} ${f.a}`;
}

export function diasDeActividad(a) {
  if (!a?.fecha || !a.fechaFin) return 1;
  return Math.round((Date.parse(`${a.fechaFin}T00:00:00Z`) - Date.parse(`${a.fecha}T00:00:00Z`)) / 86400000) + 1;
}
