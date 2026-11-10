// Cliente del módulo de Tesorería (backend/lib/tesoreria/*). Todo pasa por /api/tesoreria (proxy del frontend).

async function handle(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.error || `Error ${res.status}`), data || {});
  return data;
}
const json = (method, body) => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
const qs = (o) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o || {})) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  return p.toString();
};
const get = (url) => fetch(url, { cache: "no-store" }).then(handle);

export const tesResumen = (anio, mes) => get(`/api/tesoreria/resumen?${qs({ anio, mes })}`);
export const tesMaestros = () => get("/api/tesoreria/maestros");
export const tesCrearMaestro = (tipo, datos) => fetch(`/api/tesoreria/maestros/${tipo}`, json("POST", datos)).then(handle);
export const tesEditarMaestro = (tipo, id, datos) => fetch(`/api/tesoreria/maestros/${tipo}/${id}`, json("PATCH", datos)).then(handle);
export const tesBorrarMaestro = (tipo, id) => fetch(`/api/tesoreria/maestros/${tipo}/${id}`, { method: "DELETE" }).then(handle);

export const tesMovimientos = (filtros) => get(`/api/tesoreria/movimientos?${qs(filtros)}`);
export const tesMovimiento = (id) => get(`/api/tesoreria/movimientos/${id}`);
export const tesCrearMovimiento = (datos) => fetch("/api/tesoreria/movimientos", json("POST", datos)).then(handle);
export const tesEditarMovimiento = (id, datos) => fetch(`/api/tesoreria/movimientos/${id}`, json("PATCH", datos)).then(handle);
export const tesBorrarMovimiento = (id) => fetch(`/api/tesoreria/movimientos/${id}`, { method: "DELETE" }).then(handle);

function multipart(url, campos) {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) if (v !== undefined && v !== null) f.set(k, v);
  return fetch(url, { method: "POST", body: f }).then(handle);
}
export const tesLeerSoporte = (archivo) => multipart("/api/tesoreria/soporte/leer", { archivo });
export const tesGuardarConSoporte = ({ archivo, datos, proyectadoId, lineaId }) => multipart("/api/tesoreria/soporte/guardar", { archivo, datos: JSON.stringify(datos), proyectadoId, lineaId });
export const tesAgregarSoporte = (movimientoId, archivo) => multipart(`/api/tesoreria/movimientos/${movimientoId}/soportes`, { archivo });
export const tesBorrarSoporte = (id) => fetch(`/api/tesoreria/soportes/${id}`, { method: "DELETE" }).then(handle);
export const urlSoporte = (id) => `/api/tesoreria/soportes/${id}`;

export const tesImportarExtracto = (cuentaId, archivo) => multipart("/api/tesoreria/extractos", { cuentaId, archivo });
export const tesExtractos = (filtros) => get(`/api/tesoreria/extractos?${qs(filtros)}`);
export const tesConciliacion = (cuentaId, anio, mes) => get(`/api/tesoreria/conciliacion?${qs({ cuentaId, anio, mes })}`);
export const tesEnlazar = (lineaId, movimientoId) => fetch("/api/tesoreria/conciliacion/enlazar", json("POST", { lineaId, movimientoId })).then(handle);
export const tesDesenlazar = (lineaId) => fetch("/api/tesoreria/conciliacion/desenlazar", json("POST", { lineaId })).then(handle);
export const tesIgnorar = (lineaId, ignorar) => fetch("/api/tesoreria/conciliacion/ignorar", json("POST", { lineaId, ignorar })).then(handle);
export const tesCrearDesdeLinea = (datos) => fetch("/api/tesoreria/conciliacion/crear", json("POST", datos)).then(handle);
export const tesAutoConciliar = (cuentaId, anio, mes) => fetch("/api/tesoreria/conciliacion/auto", json("POST", { cuentaId, anio, mes })).then(handle);

export const tesCierre = (anio, mes) => get(`/api/tesoreria/cierre?${qs({ anio, mes })}`);
export const tesFirmar = (anio, mes) => fetch("/api/tesoreria/cierre/firmar", json("POST", { anio, mes })).then(handle);
export const urlReporteExcel = (anio) => `/api/tesoreria/reportes?${qs({ anio, formato: "xlsx" })}`;

export const tesAccesos = () => get("/api/tesoreria/accesos");
export const tesPersonas = () => get("/api/tesoreria/accesos/personas");
export const tesOtorgar = (userId, nivel) => fetch("/api/tesoreria/accesos", json("POST", { userId, nivel })).then(handle);
export const tesQuitar = (id) => fetch(`/api/tesoreria/accesos/${id}`, { method: "DELETE" }).then(handle);
export const tesExplicar = (datos) => fetch("/api/tesoreria/explicar", json("POST", datos)).then(handle);
