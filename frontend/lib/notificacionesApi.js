// Cliente de /api/notificaciones (proxied al backend por next.config.js). Ver docs/notificaciones-diseno.md.

async function handle(res) {
  let data = null;
  try { data = await res.json(); } catch { /* sin cuerpo */ }
  if (!res.ok) {
    const err = new Error(data?.error || `Error ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

const post = (url, body) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) }).then(handle);
const qs = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v != null && v !== "")).toString();

export const listarNotificaciones = (o) => fetch(`/api/notificaciones?${qs(o)}`, { cache: "no-store" }).then(handle);
export const crearNotificacion = (data) => post("/api/notificaciones", data);
export const actualizarNotificacion = (id, data) => fetch(`/api/notificaciones/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then(handle);
export const eliminarNotificacion = (id) => fetch(`/api/notificaciones/${id}`, { method: "DELETE" }).then(handle);
export const cambiarEstadoNotificacion = (id, accion, motivo) => post(`/api/notificaciones/${id}/estado`, { accion, motivo });
export const probarNotificacion = (id) => post(`/api/notificaciones/${id}/probar`);
export const enviarAhoraNotificacion = (id) => post(`/api/notificaciones/${id}/enviar`);
export const cambiarSuscripcion = (id, accion) => post(`/api/notificaciones/${id}/suscripcion`, { accion });
export const listarEjecuciones = (id, o) => fetch(`/api/notificaciones/${id}/ejecuciones?${qs(o)}`, { cache: "no-store" }).then(handle);
export const interpretarConNova = (body) => post("/api/notificaciones/nova/interpretar", body);
export const destinatariosElegibles = (fuente) => fetch(`/api/notificaciones/destinatarios-elegibles?${qs({ fuente })}`, { cache: "no-store" }).then(handle);
export const estadoCanales = () => fetch("/api/notificaciones/canales", { cache: "no-store" }).then(handle);
export const previsualizarProgramacion = (regla) => post("/api/notificaciones/proximas", regla);
export const listarBandeja = (o) => fetch(`/api/notificaciones/bandeja?${qs(o)}`, { cache: "no-store" }).then(handle);
export const contarNoLeidas = () => fetch("/api/notificaciones/bandeja/no-leidas", { cache: "no-store" }).then(handle);
// Avisos en vivo: contador + entregas nuevas desde el último id visto (sin `desde`, solo devuelve el último id).
export const novedades = (desde) => fetch(`/api/notificaciones/bandeja/no-leidas?vivo=1${desde != null ? `&desde=${desde}` : ""}`, { cache: "no-store" }).then(handle);
export const marcarLeidas = (body) => post("/api/notificaciones/bandeja/leer", body);

// La campana y el menú lateral comparten el contador sin pedirlo dos veces.
export const EVENTO_NO_LEIDAS = "notificaciones:no-leidas";
// Solicitudes de compra pendientes (solo para quien puede crear compras): también suman en la campana y el menú.
export const EVENTO_SOLICITUDES = "notificaciones:solicitudes";
export function avisarSolicitudes(n) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVENTO_SOLICITUDES, { detail: n }));
}
export function avisarNoLeidas(n) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVENTO_NO_LEIDAS, { detail: n }));
}
