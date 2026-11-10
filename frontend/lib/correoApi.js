// Cliente de "Mi correo" (correo vinculado y agente de correo) — ver backend/lib/correoCuentas.js y agenteCorreoProveedores.js.

async function handle(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.error || `Error ${res.status}`), data || {});
  return data;
}

const json = (method, body) => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });

export const estadoCorreoApi = () => fetch("/api/correo", { cache: "no-store" }).then(handle);
export const cambiarAgenteCorreoApi = (agenteActivo) => fetch("/api/correo", json("PATCH", { agenteActivo })).then(handle);
export const desvincularCorreoApi = () => fetch("/api/correo", { method: "DELETE" }).then(handle);
export const revisarCorreoApi = () => fetch("/api/correo/revisar", { method: "POST" }).then(handle);

export function simularCorreoApi({ asunto, remitente, cuerpo, adjunto }) {
  const form = new FormData();
  form.set("asunto", asunto || "");
  form.set("remitente", remitente || "");
  form.set("cuerpo", cuerpo || "");
  if (adjunto) form.set("adjunto", adjunto);
  return fetch("/api/correo/simular", { method: "POST", body: form }).then(handle);
}

export function listarSolicitudesCorreoApi({ estado, page, size } = {}) {
  const q = new URLSearchParams();
  if (estado) q.set("estado", estado);
  if (page) q.set("page", String(page));
  if (size) q.set("size", String(size));
  return fetch(`/api/correo/solicitudes?${q}`, { cache: "no-store" }).then(handle);
}

export const solicitudCorreoApi = (id) => fetch(`/api/correo/solicitudes/${id}`, { cache: "no-store" }).then(handle);
export const aprobarSolicitudCorreoApi = (id, datos) => fetch(`/api/correo/solicitudes/${id}/aprobar`, json("POST", datos)).then(handle);
export const descartarSolicitudCorreoApi = (id, motivo) => fetch(`/api/correo/solicitudes/${id}/descartar`, json("POST", { motivo })).then(handle);

// Maestros de Proveedores desde el navegador (mismo formato que lib/catalogosProveedor.js, que es del servidor).
const TIPOS = { areas: "areaProveedor", tipos: "tipoProveedor", clasificaciones: "clasificacionMonto", servicios: "tipoServicio", motivos: "motivoExcepcion" };
export async function catalogosProveedorCliente() {
  const pares = await Promise.all(Object.entries(TIPOS).map(async ([clave, tipo]) => {
    const r = await fetch(`/api/maestros?tipo=${tipo}`, { cache: "no-store" }).then(handle).catch(() => ({}));
    return [clave, r.maestros || []];
  }));
  return Object.fromEntries(pares);
}
