// Búsquedas por texto de toda la app: no distinguen mayúsculas, minúsculas ni tildes (á = a, ñ = n, ü = u) y
// tratan varios espacios como uno. Toda caja de búsqueda filtra con esto (convención en CLAUDE.md).
export const normalizar = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

// true si la búsqueda está vacía o aparece en alguno de los campos (textos, números o null).
export function coincide(q, ...campos) {
  const n = normalizar(q);
  if (!n) return true;
  return campos.some((c) => c != null && normalizar(c).includes(n));
}
