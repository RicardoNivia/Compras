// Utilidades de formateo, portadas del panel original.

export const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export function fmtCOP(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

export function fmtCompact(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    notation: "compact",
    compactDisplay: "short",
    maximumFractionDigits: 1,
  }).format(n);
}

export function fmtNum(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("es-CO").format(n);
}

export function esDecimal(n, decimals) {
  return new Intl.NumberFormat("es-CO", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}

export function fmtPesos(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  if (n === 0) return "$0";
  const abs = Math.abs(n);
  if (abs >= 1e6) return `${esDecimal(n / 1e6, 1)} millones de pesos`;
  if (abs >= 1e3) return `${esDecimal(n / 1e3, 1)} mil pesos`;
  return `${fmtNum(Math.round(n))} pesos`;
}

export function fmtDateDisplay(iso) {
  if (!iso) return "—";
  const parts = String(iso).split("-");
  if (parts.length !== 3) return "—";
  const [y, m, d] = parts;
  return `${d}/${m}/${y}`;
}

// Para timestamps reales (p.ej. Record.createdAt — "fecha de registro" en el
// servidor), a diferencia de fmtDateDisplay que solo formatea una fecha de
// negocio "YYYY-MM-DD" sin hora.
export function fmtDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-CO", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function monthKey(iso) {
  if (!iso) return null;
  return String(iso).slice(0, 7);
}

export function monthLabel(key, multiYear) {
  if (!key) return "";
  const [y, m] = key.split("-");
  const idx = parseInt(m, 10) - 1;
  const name = MESES[idx] || key;
  if (!multiYear) return name;
  return `${name.slice(0, 3)} ${y.slice(2)}`;
}
