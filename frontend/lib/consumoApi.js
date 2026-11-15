// Cliente del módulo de Consumo (backend/lib/consumo/*). Todo pasa por /api/consumo (proxy del frontend).

async function handle(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.error || `Error ${res.status}`), data || {});
  return data;
}
const json = (method, body) => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
const get = (url) => fetch(url, { cache: "no-store" }).then(handle);

// Maestros (tipo: sede | empresa | cuenta). La cuenta lleva sus medidores en `medidores`.
export const conMaestros = () => get("/api/consumo/maestros");
export const conCrearMaestro = (tipo, datos) => fetch(`/api/consumo/maestros/${tipo}`, json("POST", datos)).then(handle);
export const conEditarMaestro = (tipo, id, datos) => fetch(`/api/consumo/maestros/${tipo}/${id}`, json("PATCH", datos)).then(handle);
export const conBorrarMaestro = (tipo, id) => fetch(`/api/consumo/maestros/${tipo}/${id}`, { method: "DELETE" }).then(handle);

// Recibos (filtros: q, sedeId, servicio, anio, pago, lectura, page, size)
const qs = (o) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o || {})) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  return p.toString();
};
export const conRecibos = (filtros) => get(`/api/consumo/recibos?${qs(filtros)}`);
export const conRecibo = (id) => get(`/api/consumo/recibos/${id}`);
export const conCrearRecibo = (datos) => fetch("/api/consumo/recibos", json("POST", datos)).then(handle);
export const conEditarRecibo = (id, datos) => fetch(`/api/consumo/recibos/${id}`, json("PATCH", datos)).then(handle);
export const conBorrarRecibo = (id) => fetch(`/api/consumo/recibos/${id}`, { method: "DELETE" }).then(handle);
export const conPagoRecibo = (id, datos) => fetch(`/api/consumo/recibos/${id}/pago`, json("POST", datos)).then(handle);
export function conAgregarSoporte(reciboId, archivo) {
  const f = new FormData();
  f.set("archivo", archivo);
  return fetch(`/api/consumo/recibos/${reciboId}/soportes`, { method: "POST", body: f }).then(handle);
}
// Nova lee un recibo (PDF o foto): devuelve lo leído, la sede propuesta y lo comprobado. No guarda nada.
export function conLeerRecibo(archivo) {
  const f = new FormData();
  f.set("archivo", archivo);
  return fetch("/api/consumo/recibos/leer", { method: "POST", body: f }).then(handle);
}
export const conBorrarSoporte =(id) => fetch(`/api/consumo/soportes/${id}`, { method: "DELETE" }).then(handle);
export const urlSoporteConsumo = (id) => `/api/consumo/soportes/${id}`;

// Análisis (filtros: sedeId, servicio, anio): Resumen ejecutivo y Auditoría y hallazgos del Excel del contador.
export const conAnalisis = (filtros) => get(`/api/consumo/analisis?${qs(filtros)}`);
export const conAuditoria = (filtros) => get(`/api/consumo/analisis/auditoria?${qs(filtros)}`);
