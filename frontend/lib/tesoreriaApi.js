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
function multipart(url, campos) {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) if (v !== undefined && v !== null) f.set(k, v);
  return fetch(url, { method: "POST", body: f }).then(handle);
}

// Resumen
export const tesResumen = (anio, mes, vista) => get(`/api/tesoreria/resumen?${qs({ anio, mes, vista })}`);

// Maestros (tipo: banco | medio | item | concepto | pagador)
export const tesMaestros = () => get("/api/tesoreria/maestros");
export const tesCrearMaestro = (tipo, datos) => fetch(`/api/tesoreria/maestros/${tipo}`, json("POST", datos)).then(handle);
export const tesEditarMaestro = (tipo, id, datos) => fetch(`/api/tesoreria/maestros/${tipo}/${id}`, json("PATCH", datos)).then(handle);
export const tesBorrarMaestro = (tipo, id) => fetch(`/api/tesoreria/maestros/${tipo}/${id}`, { method: "DELETE" }).then(handle);

// Movimientos del banco
export const tesMovimientos = (filtros) => get(`/api/tesoreria/movimientos?${qs(filtros)}`);
export const tesMovimiento = (id) => get(`/api/tesoreria/movimientos/${id}`);
export const tesCrearMovimiento = (datos) => fetch("/api/tesoreria/movimientos", json("POST", datos)).then(handle);
export const tesEditarMovimiento = (id, datos) => fetch(`/api/tesoreria/movimientos/${id}`, json("PATCH", datos)).then(handle);
export const tesBorrarMovimiento = (id) => fetch(`/api/tesoreria/movimientos/${id}`, { method: "DELETE" }).then(handle);
export const tesAsociarMovimiento = (id, asociaciones) => fetch(`/api/tesoreria/movimientos/${id}/asociaciones`, json("PUT", { asociaciones })).then(handle);
export const tesLeerSoporte = (archivo) => multipart("/api/tesoreria/soporte/leer", { archivo });
export const tesAgregarSoporte = (movimientoId, archivo) => multipart(`/api/tesoreria/movimientos/${movimientoId}/soportes`, { archivo });
export const tesBorrarSoporte = (id) => fetch(`/api/tesoreria/soportes/${id}`, { method: "DELETE" }).then(handle);
export const urlSoporte = (id) => `/api/tesoreria/soportes/${id}`;
// Extracto en dos pasos: analizar (no registra nada) y aplicar lo aprobado.
export const tesAnalizarExtracto = (bancoId, archivo) => multipart("/api/tesoreria/extractos", { bancoId, archivo });
export const tesAplicarExtracto = (token, aprobados, guardarSaldos) => fetch("/api/tesoreria/extractos/aplicar", json("POST", { token, aprobados, guardarSaldos })).then(handle);

// Pagos programados
export const tesPagos = (filtros) => get(`/api/tesoreria/pagos?${qs(filtros)}`);
export const tesPago = (id) => get(`/api/tesoreria/pagos/${id}`);
export const tesCrearPago = (datos) => fetch("/api/tesoreria/pagos", json("POST", datos)).then(handle);
export const tesEditarPago = (id, datos) => fetch(`/api/tesoreria/pagos/${id}`, json("PATCH", datos)).then(handle);
export const tesBorrarPago = (id) => fetch(`/api/tesoreria/pagos/${id}`, { method: "DELETE" }).then(handle);
export const tesAsociarPago = (id, asociaciones) => fetch(`/api/tesoreria/pagos/${id}/asociaciones`, json("PUT", { asociaciones })).then(handle);
export const tesProponerPagos = (anio, mes) => fetch("/api/tesoreria/pagos/proponer", json("POST", { anio, mes })).then(handle);
export const tesAplicarPropuestos = (items) => fetch("/api/tesoreria/pagos/proponer/aplicar", json("POST", { items })).then(handle);

// Gastos periódicos
export const tesPeriodicos = (anio) => get(`/api/tesoreria/periodicos?${qs({ anio })}`);
export const tesCrearPeriodico = (datos) => fetch("/api/tesoreria/periodicos", json("POST", datos)).then(handle);
export const tesEditarPeriodico = (id, datos) => fetch(`/api/tesoreria/periodicos/${id}`, json("PATCH", datos)).then(handle);
export const tesVistaApagar = (id) => get(`/api/tesoreria/periodicos/${id}`);
export const tesAnios = () => get("/api/tesoreria/anios");
export const tesCrearAnio = (anio) => fetch("/api/tesoreria/anios", json("POST", { anio })).then(handle);
export const tesBorrarPeriodico = (id) => fetch(`/api/tesoreria/periodicos/${id}`, { method: "DELETE" }).then(handle);
export const tesReplicar = (anio, desde) => fetch("/api/tesoreria/periodicos/replicar", json("POST", { anio, desde })).then(handle);
export const tesVistaReplicar = (anio, desde) => get(`/api/tesoreria/periodicos/replicar?${qs({ anio, desde })}`);

// Importar plantilla
export const tesAnalizarPlantilla = (archivo) => multipart("/api/tesoreria/importar/analizar", { archivo });
export const tesAplicarPlantilla = (archivo, decisiones) => multipart("/api/tesoreria/importar/aplicar", { archivo, decisiones: JSON.stringify(decisiones) });

// Agente de asociación
export const tesPropuestas = (filtros) => get(`/api/tesoreria/agente?${qs(filtros)}`);
// agente: "movimientos" (movimiento → pago, por defecto) | "pagos" (pago → movimiento, con anio/mes/alcance).
export const tesBuscarPropuestas = (opciones = {}) => fetch("/api/tesoreria/agente/buscar", json("POST", opciones)).then(handle);
export const tesResolverPropuesta = (id, accion) => fetch(`/api/tesoreria/agente/propuestas/${id}`, json("POST", { accion })).then(handle);
export const tesAceptarAltas = (agente = "movimientos") => fetch("/api/tesoreria/agente/aceptar-altas", json("POST", { agente })).then(handle);

// Saldos
export const tesSaldos = (anio) => get(`/api/tesoreria/saldos?${qs({ anio })}`);
export const tesGuardarSaldoInicial = (bancoId, anio, valor) => fetch("/api/tesoreria/saldos/iniciales", json("PUT", { bancoId, anio, valor })).then(handle);

// Alertas
export const tesAlertas = (filtros) => get(`/api/tesoreria/alertas?${qs(filtros)}`);
export const tesRevisarAlertas = (ids, revisada = true) => fetch("/api/tesoreria/alertas/revisar", json("POST", { ids, revisada })).then(handle);

// Reportes
export const urlReporteExcel = (anio, estado = "E") => `/api/tesoreria/reportes?${qs({ anio, formato: "xlsx", estado })}`;

// Conciliación y cierre
export const tesConciliacionMes = (anio, mes) => get(`/api/tesoreria/conciliacion?${qs({ anio, mes })}`);
export const tesConciliacionBanco = (bancoId, anio, mes) => get(`/api/tesoreria/conciliacion/banco?${qs({ bancoId, anio, mes })}`);
export const tesResolverPendiente = (extractoId, clave, accion) => fetch("/api/tesoreria/conciliacion/pendiente", json("POST", { extractoId, clave, accion })).then(handle);
export const tesVerificarMovimiento = (movimientoId, verificado = true) => fetch("/api/tesoreria/conciliacion/verificar", json("POST", { movimientoId, verificado })).then(handle);
export const tesFirmarCierre = (anio, mes) => fetch("/api/tesoreria/cierre/firmar", json("POST", { anio, mes })).then(handle);
export const tesReabrirCierre = (anio, mes) => fetch("/api/tesoreria/cierre/reabrir", json("POST", { anio, mes })).then(handle);

// Por resolver (operador), limpieza de vencidos heredados y proyección de caja por cuenta.
export const tesPorResolver = () => get("/api/tesoreria/por-resolver");
export const tesVencidosHeredados = (hasta) => get(`/api/tesoreria/pagos/vencidos-heredados?${qs({ hasta })}`);
export const tesMarcarPagadosLote = (ids, motivo) => fetch("/api/tesoreria/pagos/vencidos-heredados", json("POST", { ids, motivo })).then(handle);
export const tesProyeccion = (periodo) => get(`/api/tesoreria/proyeccion?${qs({ periodo })}`);

// Soportes que llegaron al correo de soportes (Gmail compartido) y que Nova ya leyó (backend/lib/tesoreria/soportesCorreo.js).
export const tesSoportesCorreo = (filtros) => get(`/api/tesoreria/soportes-correo?${qs(filtros)}`);
export const tesSoporteCorreo = (id) => get(`/api/tesoreria/soportes-correo/${id}`);
export const urlSoporteCorreo = (id) => `/api/tesoreria/soportes-correo/${id}/archivo`;
// El comprobante como File, para adjuntarlo al movimiento desde el formulario.
export async function tesArchivoSoporteCorreo(id, nombre, tipo) {
  const res = await fetch(urlSoporteCorreo(id), { cache: "no-store" });
  if (!res.ok) await handle(res);
  const blob = await res.blob();
  return new File([blob], nombre || "soporte", { type: tipo || blob.type });
}
export const tesRegistrarSoporteCorreo = (id, movimientoId) => fetch(`/api/tesoreria/soportes-correo/${id}/registrar`, json("POST", { movimientoId })).then(handle);
export const tesDescartarSoporteCorreo = (id, motivo) => fetch(`/api/tesoreria/soportes-correo/${id}/descartar`, json("POST", { motivo })).then(handle);
