// Opciones fijas de la ficha de proveedor. Tipo (criticidad), clasificación por monto, tipo de
// servicio, área de proveedor y motivo de excepción son MAESTROS (se cargan de /api/maestros).
// Copia (sin Prisma) de backend/lib/proveedoresCicloReglas.js — mantener ambas en sync.
export const REVISIONES = ["SRM", "Financiero"];
export const ESTADOS_CICLO = [
  { key: "desactualizado", label: "Desactualizado" },
  { key: "en_proceso", label: "En proceso" },
  { key: "en_aprobacion", label: "En aprobación" },
  { key: "actualizado", label: "Actualizado" },
];

function sinTildes(v) {
  return String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

// La criticidad se reconoce por el texto del maestro "Tipo de proveedor" sin tildes ni mayúsculas.
export function esCritico(criticidad) {
  const t = sinTildes(criticidad);
  return /critic/.test(t) && !/no ?critic/.test(t);
}

// "critico" | "no_critico" | "sin_definir" — clave del filtro de criticidad.
export function claveCriticidad(criticidad) {
  if (!criticidad) return "";
  return esCritico(criticidad) ? "critico" : "no_critico";
}

// Busca en un maestro el valor que coincide con un texto (para lo que precarga Nova).
export function maestroPorTexto(lista, texto) {
  const t = sinTildes(texto);
  if (!t) return null;
  return lista.find((m) => sinTildes(m.valor) === t) || null;
}

export function fmtFecha(d) {
  return d ? new Date(d).toLocaleDateString("es-CO") : "—";
}

// Día (aaaa-mm-dd) en hora de Colombia, para inputs de tipo fecha.
export function diaISO(d = new Date()) {
  return d ? new Date(d).toLocaleDateString("en-CA", { timeZone: "America/Bogota" }) : "";
}

// Normalización del NIT (llave primaria) — copia de backend/lib/proveedores.js#normalizeNit.
//   · "PENDIENTE-…" se conserva · NIT colombiano con DV ("900.123.456-7") → sin el DV
//   · resto (incluye NIT extranjeros alfanuméricos) → mayúsculas, solo letras y dígitos.
export function normalizeNit(v) {
  const s = String(v ?? "").trim().toUpperCase();
  if (/^PEND/.test(s)) return s;
  const conDv = s.match(/^(\d{1,3}(?:[.\s]?\d{3}){1,3})\s*-\s*\d$/);
  if (conDv) return conDv[1].replace(/[^0-9]/g, "");
  return s.replace(/[^A-Z0-9]/g, "");
}

export function nitValido(nit) {
  return /^[A-Z0-9]{5,20}$/.test(nit) && /\d/.test(nit);
}
