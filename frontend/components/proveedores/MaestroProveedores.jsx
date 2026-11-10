"use client";

import { useState } from "react";
import {
  deleteProveedorApi, fetchMaestroProveedores, cambiarEstadoCicloApi, cambiarClasificacionApi, setDocumentoCicloApi, accionMasivaProveedoresApi,
} from "@/lib/api";
import { IconPlus, IconSpark, IconEye, IconEdit, IconInfo, IconTrash } from "@/components/icons";
import BuscarConNova from "@/components/proveedores/BuscarConNova";
import ProveedorDetalleModal from "@/components/proveedores/ProveedorDetalleModal";
import ProveedorFormModal from "@/components/proveedores/ProveedorFormModal";
import InformeMensualModal from "@/components/proveedores/InformeMensualModal";
import FechaActualizacionModal from "@/components/proveedores/FechaActualizacionModal";
import { usePantallaNova } from "@/lib/novaPantalla";
import ValoracionPuntaje from "@/components/ValoracionPuntaje";
import { esCritico, claveCriticidad, fmtFecha } from "@/lib/proveedoresOpciones";

const VACIO = { q: "", clasificacion: [], estado: [], checklist: "", criticidad: "", areaId: "", clasificacionMontoId: "", tipoServicioId: "", excepcion: "", registradoDesde: "", registradoHasta: "" };
const PAGE_SIZES = [25, 50, 100];

// Misma nomenclatura de la página original de Gestión de Proveedores.
const PESTANAS = [
  { key: "todos", label: "Todos", filtro: () => true, ayuda: "Todos los proveedores del maestro con los filtros aplicados: nuevos, de actualización, excepciones, inactivos y por registrar." },
  { key: "nuevos", label: "Nuevos", filtro: (r) => r.clasificacion === "nuevo", ayuda: "Proveedores creados en el año del ciclo vigente. Entran ya actualizados, así que no se les pide actualización este ciclo, pero sí completar el checklist. El 1 de abril siguiente pasan a Actualización." },
  { key: "actualizacion", label: "Actualización", filtro: (r) => r.clasificacion === "actualizacion", ayuda: "Proveedores activos que deben actualizarse cada año. El día siguiente a la fecha de corte (31 de marzo por defecto) quedan Desactualizados. Pasan a Actualizado cuando el checklist está completo (6/6) y se aprueba." },
  { key: "excepciones", label: "Excepciones", filtro: (r) => r.clasificacion === "excepcion", ayuda: "Proveedores que no requieren actualización anual ni checklist (gran contribuyente, internacional, actividad económica, compra ocasional…). Tienen un motivo obligatorio, no generan alerta en Compras y se marca si ya radican facturas." },
  { key: "checklist", label: "Checklist", filtro: (r) => r.clasificacion === "nuevo" || r.clasificacion === "actualizacion", ayuda: "Proveedores Nuevos y de Actualización con sus 6 requisitos: criticidad definida, área y servicio, contacto, RUT vigente, certificación bancaria y listas restrictivas. Los 3 primeros se marcan solos si el dato existe; todos se pueden marcar a mano. Si falta alguno, Compras ve una alerta." },
  { key: "inactivos", label: "Inactivos", filtro: (r) => r.clasificacion === "inactivo", ayuda: "Proveedores desvinculados, no aptos o anulados. No aparecen al registrar compras y no participan en el ciclo. Conservan su histórico y se pueden reactivar desde Editar." },
  { key: "por_registrar", label: "Por registrar", filtro: (r) => r.clasificacion === "por_registrar", ayuda: "Proveedores del catálogo con NIT provisional (PENDIENTE-…), usados en compras antiguas y nunca registrados formalmente. No participan en el ciclo; en Compras muestran el aviso \"Proveedor sin NIT\". Se resuelven editándolos con su NIT real." },
];

const ESTADOS = [
  { key: "desactualizado", label: "Desactualizado" },
  { key: "en_proceso", label: "En proceso" },
  { key: "en_aprobacion", label: "En aprobación" },
  { key: "actualizado", label: "Actualizado" },
];

const PILL_ESTADO = { desactualizado: "warning", en_proceso: "accent", en_aprobacion: "accent", actualizado: "good" };

const CORTOS = {
  criticidadDefinida: "Crit. definida",
  areaAsignada: "Área asignada",
  contactoRegistrado: "Contacto",
  rutVigente: "RUT",
  certBancaria: "Cert. banc.",
  listasRestr: "Listas",
};

function celdaCriticidad(r) {
  if (!r.criticidad) return <span className="muted">Sin definir</span>;
  return esCritico(r.criticidad) ? <span className="pill critical">{r.criticidad}</span> : r.criticidad;
}

// Texto largo en una sola línea con el detalle completo al pasar el mouse (patrón de Registros).
function celdaTexto(v) {
  if (!v) return <span className="muted">—</span>;
  return (
    <span className="desc-tooltip-wrap">
      <span className="desc-text">{v}</span>
      <span className="desc-tooltip-bubble">{v}</span>
    </span>
  );
}

function motivoFila(r) {
  if (r.clasificacion === "inactivo") return r.inactivoMotivo || "Inactivo";
  if (r.clasificacion === "excepcion") return r.motivoExcepcion || "Excepción";
  if (r.clasificacion === "por_registrar") return "NIT provisional";
  return "—";
}

// Recalcula el checklist de una fila tras marcar un requisito (actualización optimista).
function conRequisito(r, clave, cumple) {
  const items = r.checklist.items.map((it) => (it.clave === clave ? { ...it, cumple, marcado: true } : it));
  const completos = items.filter((it) => it.cumple).length;
  return { ...r, checklist: { ...r.checklist, items, completos, faltan: items.filter((it) => !it.cumple).map((it) => it.label) } };
}

// Maestro general de proveedores. Misma estructura que la tabla de Registros: barra de filtros,
// pestañas con la nomenclatura original, tabla con pie de paginación y el detalle en una modal.
// catalogos: maestros de Proveedores { areas, tipos, clasificaciones, servicios, motivos } (ver app/(app)/proveedores/page.js).
export default function MaestroProveedores({ initial, catalogos = {}, canEdit, initialQ = "" }) {
  const { areas = [], clasificaciones = [], servicios = [] } = catalogos;
  const [data, setData] = useState(initial);
  const [filters, setFilters] = useState(() => ({ ...VACIO, q: initialQ }));
  const [searchMode, setSearchMode] = useState("manual");
  const [pestana, setPestana] = useState(() => {
    // Con una búsqueda (por NIT, desde Mi día) se muestran todos los grupos para no ocultar el proveedor.
    if (initialQ) return "todos";
    const c = initial.conteos.clasificacion;
    return c.actualizacion ? "actualizacion" : c.nuevo ? "nuevos" : "todos";
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
  const [detalleId, setDetalleId] = useState(null);
  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState(null);
  // Interruptor "solo checklist incompleto": activado por defecto en Checklist.
  const [soloIncompletos, setSoloIncompletos] = useState({ checklist: true, excepciones: false });
  const [informe, setInforme] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [novaInfo, setNovaInfo] = useState("");
  const [seleccion, setSeleccion] = useState(() => new Set());
  const [estadoMasivo, setEstadoMasivo] = useState("en_proceso");
  const [ocupado, setOcupado] = useState(false);
  // Aprobación pendiente de la fecha de actualización: { titulo, aplicar(fecha) }.
  const [aprobando, setAprobando] = useState(null);
  // Proveedor a eliminar (confirmación). Solo se puede si ningún registro de compra lo usa.
  const [eliminando, setEliminando] = useState(null);
  const [borrando, setBorrando] = useState(false);

  async function confirmarEliminar() {
    if (!eliminando) return;
    setBorrando(true);
    setError("");
    setAviso("");
    try {
      await deleteProveedorApi(eliminando.nit);
      setAviso(`Se eliminó «${eliminando.nombre}» (NIT ${eliminando.nit}).`);
      setEliminando(null);
      setSeleccion((sel) => { const n = new Set(sel); n.delete(eliminando.nit); return n; });
      await recargar();
    } catch (err) {
      setError(err.message || "No se pudo eliminar el proveedor.");
      setEliminando(null);
    } finally {
      setBorrando(false);
    }
  }

  async function recargar(f = filters) {
    try {
      setData(await fetchMaestroProveedores(f));
      setError("");
    } catch (err) {
      setError(err.message || "No se pudo cargar el maestro.");
    }
  }

  function cambiar(patch) {
    const f = { ...filters, ...patch };
    setFilters(f);
    setPage(1);
    recargar(f);
  }

  // Nova devuelve filtros con nombres de área; aquí se traducen a id del maestro.
  function aplicarNova(f, listaAreas) {
    const area = f.area ? listaAreas.find((a) => a.valor.toLowerCase() === String(f.area).toLowerCase()) : null;
    const nuevo = {
      ...VACIO,
      q: f.q || "",
      clasificacion: f.clasificacion ? [f.clasificacion] : [],
      estado: f.estado ? [f.estado] : [],
      criticidad: claveCriticidad(f.criticidad),
      checklist: f.checklist || "",
      areaId: area?.id || "",
    };
    setFilters(nuevo);
    setPage(1);
    setPestana("todos");
    setNovaInfo(f.area && !area ? `Nova no encontró el área «${f.area}»; se aplicó el resto de filtros.` : "");
    recargar(nuevo);
  }

  function limpiar() {
    setFilters(VACIO);
    setNovaInfo("");
    setPage(1);
    recargar(VACIO);
  }

  // Cambiar el estado de un proveedor directamente desde la tabla.
  async function cambiarEstado(r, estado, fechaActualizacion) {
    if (estado === "actualizado" && !fechaActualizacion) {
      setAprobando({ titulo: `«${r.nombre}» (NIT ${r.nit}) pasa a Actualizado.`, aplicar: (fecha) => cambiarEstado(r, estado, fecha) });
      return;
    }
    setError("");
    setAviso("");
    setOcupado(true);
    try {
      await cambiarEstadoCicloApi(r.nit, estado, fechaActualizacion);
      setAviso(`«${r.nombre}» pasó a ${ESTADOS.find((e) => e.key === estado)?.label}.`);
    } catch (err) {
      setError(err.message || "No se pudo cambiar el estado.");
    } finally {
      setOcupado(false);
      await recargar();
    }
  }

  // Excepciones: marcar si ya está radicando facturas.
  async function alternarRadicacion(r, radica) {
    setError("");
    try {
      await cambiarClasificacionApi(r.nit, { accion: "radicar", radica });
    } catch (err) {
      setError(err.message || "No se pudo guardar la radicación.");
    }
    recargar();
  }

  // Marcar o desmarcar un requisito del checklist con un clic (se refleja al instante).
  async function alternarRequisito(r, clave, cumple) {
    setError("");
    setData((d) => ({ ...d, rows: d.rows.map((x) => (x.nit === r.nit ? conRequisito(x, clave, cumple) : x)) }));
    try {
      await setDocumentoCicloApi(r.nit, clave, cumple);
    } catch (err) {
      setError(err.message || "No se pudo guardar el requisito.");
    }
    recargar();
  }

  function aplicarEstadoMasivo() {
    const texto = `Estado «${ESTADOS.find((e) => e.key === estadoMasivo)?.label}»`;
    if (estadoMasivo !== "actualizado") { accionMasiva({ tipo: "estado", estado: estadoMasivo }, texto); return; }
    setAprobando({
      titulo: `${seleccion.size} proveedor(es) seleccionado(s) pasan a Actualizado con la misma fecha.`,
      aplicar: (fecha) => accionMasiva({ tipo: "estado", estado: estadoMasivo, fechaActualizacion: fecha }, texto),
    });
  }

  async function accionMasiva(body, texto) {
    setError("");
    setAviso("");
    setOcupado(true);
    try {
      const res = await accionMasivaProveedoresApi({ ids: [...seleccion], ...body });
      const omitidos = res.omitidos?.length ? ` ${res.omitidos.length} no se pudieron cambiar: ${[...new Set(res.omitidos.map((o) => o.motivo))].join(" · ")}` : "";
      setAviso(`${texto}: ${res.actualizados} proveedor(es).${omitidos}`);
      setSeleccion(new Set());
    } catch (err) {
      setError(err.message || "No se pudo aplicar la acción.");
    } finally {
      setOcupado(false);
      await recargar();
    }
  }

  const actual = PESTANAS.find((p) => p.key === pestana) || PESTANAS[0];
  const conteos = Object.fromEntries(PESTANAS.map((p) => [p.key, data.rows.filter(p.filtro).length]));
  const base = data.rows.filter(actual.filtro);
  const conToggle = pestana === "checklist" || pestana === "excepciones";
  const incompletos = base.filter((r) => r.checklist.completos < r.checklist.total).length;
  const filas = conToggle && soloIncompletos[pestana] ? base.filter((r) => r.checklist.completos < r.checklist.total) : base;
  const totalPages = Math.max(1, Math.ceil(filas.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visibles = filas.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const esChecklist = pestana === "checklist";
  const conEstado = ["todos", "nuevos", "actualizacion"].includes(pestana);
  const conMotivo = ["excepciones", "inactivos", "por_registrar"].includes(pestana);
  const seleccionable = canEdit && (esChecklist || conEstado);
  const todosMarcados = visibles.filter((r) => r.ciclo).length > 0 && visibles.filter((r) => r.ciclo).every((r) => seleccion.has(r.nit));
  const hayFiltros = JSON.stringify(filters) !== JSON.stringify(VACIO);
  usePantallaNova(
    `Pantalla Gestión de proveedores (ciclo ${data.anio}, corte en ${data.diasParaCorte} días). Pestaña activa: ${actual.label} con ${filas.length} proveedores${conToggle && soloIncompletos[pestana] ? " (solo con checklist incompleto)" : ""}. Conteos por pestaña: ${PESTANAS.map((p) => `${p.label} ${conteos[p.key]}`).join(", ")}. Filtros activos: ${hayFiltros ? "sí" : "ninguno"}.${seleccion.size ? ` Seleccionados: ${seleccion.size}.` : ""}`
  );
  const columnas = 6 + (esChecklist ? 13 : (conEstado ? 4 : 2) + 6) + (seleccionable ? 1 : 0);

  function alternarSeleccion(id) {
    const n = new Set(seleccion);
    if (n.has(id)) n.delete(id); else n.add(id);
    setSeleccion(n);
  }

  function alternarTodos() {
    const n = new Set(seleccion);
    const ids = visibles.filter((r) => r.ciclo).map((r) => r.nit);
    if (todosMarcados) ids.forEach((id) => n.delete(id)); else ids.forEach((id) => n.add(id));
    setSeleccion(n);
  }

  return (
    <div className="prov-maestro">
      <div className="toolbar prov-filtros">
        <div className="prov-filtros-fila">
          <div className="dash-tabs prov-filtros-modo" role="tablist" aria-label="Modo de búsqueda">
            <button type="button" role="tab" aria-selected={searchMode === "manual"} className="dash-tab" onClick={() => setSearchMode("manual")}>
              Filtros
            </button>
            <button type="button" role="tab" aria-selected={searchMode === "ia"} className="dash-tab" onClick={() => setSearchMode("ia")}>
              <IconSpark size={13} /> Nova
            </button>
          </div>
          {searchMode === "manual" && (
            <input
              id="prov-q" type="search" className="prov-filtros-buscar" aria-label="Buscar por nombre o NIT"
              placeholder="Buscar por nombre o NIT…" value={filters.q} onChange={(e) => cambiar({ q: e.target.value })}
            />
          )}
          <div className="spacer" />
          {hayFiltros && <button type="button" className="btn small" onClick={limpiar}>Limpiar filtros</button>}
          <button type="button" className="btn small" onClick={() => setInforme(true)}>Informe mensual</button>
          {canEdit && (
            <button type="button" className="btn btn-primary small" onClick={() => setCreando(true)}>
              <IconPlus size={13} /> Nuevo proveedor
            </button>
          )}
        </div>

        {searchMode === "ia" ? (
          <BuscarConNova areas={areas} onApply={aplicarNova} onClear={limpiar} />
        ) : (
          <div className="prov-filtros-selects">
            <select aria-label="Área" className={filters.areaId ? "activo" : ""} value={filters.areaId} onChange={(e) => cambiar({ areaId: e.target.value })}>
              <option value="">Área: todas</option>
              {areas.map((a) => <option key={a.id} value={a.id}>{a.valor}</option>)}
            </select>
            <select aria-label="Tipo (criticidad)" className={filters.criticidad ? "activo" : ""} value={filters.criticidad} onChange={(e) => cambiar({ criticidad: e.target.value })}>
              <option value="">Tipo: todos</option>
              <option value="critico">Crítico</option>
              <option value="no_critico">No crítico</option>
              <option value="sin_definir">Sin definir</option>
            </select>
            <select aria-label="Clasificación por monto" className={filters.clasificacionMontoId ? "activo" : ""} value={filters.clasificacionMontoId} onChange={(e) => cambiar({ clasificacionMontoId: e.target.value })}>
              <option value="">Clasificación: todas</option>
              {clasificaciones.map((m) => <option key={m.id} value={m.id}>{m.valor}</option>)}
            </select>
            <select aria-label="Tipo de servicio" className={filters.tipoServicioId ? "activo" : ""} value={filters.tipoServicioId} onChange={(e) => cambiar({ tipoServicioId: e.target.value })}>
              <option value="">Servicio: todos</option>
              {servicios.map((m) => <option key={m.id} value={m.id}>{m.valor}</option>)}
            </select>
            <select aria-label="Excepción" className={filters.excepcion ? "activo" : ""} value={filters.excepcion} onChange={(e) => cambiar({ excepcion: e.target.value })}>
              <option value="">Excepción: todos</option>
              <option value="si">Excepción: sí</option>
              <option value="no">Excepción: no</option>
            </select>
            <select aria-label="Estado en el ciclo" className={filters.estado.length ? "activo" : ""} value={filters.estado[0] || ""} onChange={(e) => cambiar({ estado: e.target.value ? [e.target.value] : [] })}>
              <option value="">Estado: todos</option>
              {ESTADOS.map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}
            </select>
            <select aria-label="Checklist" className={filters.checklist ? "activo" : ""} value={filters.checklist} onChange={(e) => cambiar({ checklist: e.target.value })}>
              <option value="">Checklist: todos</option>
              <option value="completo">Checklist completo</option>
              <option value="incompleto">Checklist incompleto</option>
            </select>
            <label className={`prov-filtro-mes${filters.registradoDesde || filters.registradoHasta ? " activo" : ""}`} title="Fecha en que se registró el proveedor (desde / hasta, ambas incluidas)">
              Registrado
              <input type="date" aria-label="Registrado desde" value={filters.registradoDesde} max={filters.registradoHasta || undefined} onChange={(e) => cambiar({ registradoDesde: e.target.value })} />
              a
              <input type="date" aria-label="Registrado hasta" value={filters.registradoHasta} min={filters.registradoDesde || undefined} onChange={(e) => cambiar({ registradoHasta: e.target.value })} />
            </label>
          </div>
        )}
      </div>

      {novaInfo && <p className="prov-note">{novaInfo}</p>}
      {error && <div className="modal-error" role="alert">{error}</div>}
      {aviso && <p className="prov-note" role="status">{aviso}</p>}

      <div className="dash-tabs" role="tablist" aria-label="Grupos de proveedores" style={{ marginBottom: 14 }}>
        {PESTANAS.map((p) => (
          <button
            key={p.key}
            type="button"
            role="tab"
            aria-selected={pestana === p.key}
            className="dash-tab"
            onClick={() => { setPestana(p.key); setPage(1); setSeleccion(new Set()); }}
          >
            {p.label} ({conteos[p.key]})
            <span className="prov-info" tabIndex={0} role="img" aria-label={`${p.label}: ${p.ayuda}`}>
              <IconInfo size={13} />
              <span className="prov-info-bubble" role="tooltip">{p.ayuda}</span>
            </span>
          </button>
        ))}
      </div>

      {seleccion.size > 0 && (
        <div className="toolbar prov-bulk" role="region" aria-label="Acciones sobre los seleccionados">
          <strong>{seleccion.size} seleccionado(s)</strong>
          <button type="button" className="btn small" disabled={ocupado} onClick={() => accionMasiva({ tipo: "checklist", cumple: true }, "Checklist completo")}>Marcar todos los requisitos</button>
          <button type="button" className="btn small" disabled={ocupado} onClick={() => accionMasiva({ tipo: "checklist", cumple: false }, "Checklist restablecido")}>Restablecer</button>
          <label className="prov-bulk-estado">Pasar a
            <select value={estadoMasivo} onChange={(e) => setEstadoMasivo(e.target.value)}>
              {ESTADOS.map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}
            </select>
          </label>
          <button type="button" className="btn small" disabled={ocupado} onClick={() => aplicarEstadoMasivo()}>Aplicar</button>
          <div className="spacer" />
          <button type="button" className="btn small" onClick={() => setSeleccion(new Set())}>Quitar selección</button>
        </div>
      )}

      {conToggle && (
        <label className="prov-toggle-row">
          <input type="checkbox" role="switch" className="prov-switch" checked={!!soloIncompletos[pestana]} onChange={(e) => { setSoloIncompletos({ ...soloIncompletos, [pestana]: e.target.checked }); setPage(1); }} />
          <span>Solo con checklist incompleto <strong>({incompletos} de {base.length})</strong></span>
        </label>
      )}

      <div className="table-card">
        <div className="table-scroll">
          <table className="records">
            <thead>
              <tr>
                {seleccionable && (
                  <th>
                    <input type="checkbox" checked={todosMarcados} onChange={alternarTodos} aria-label="Seleccionar todos los de esta página" />
                  </th>
                )}
                <th>Proveedor</th>
                <th>NIT</th>
                {esChecklist && <th>Proceso</th>}
                {esChecklist && <th>Estado</th>}
                {esChecklist && <th>Tipo</th>}
                <th>Área</th>
                {esChecklist && <th>Últ. actualización</th>}
                {!esChecklist && <th>Tipo</th>}
                {!esChecklist && <th>Clasificación por monto</th>}
                {!esChecklist && <th>Tipo de servicio</th>}
                {!esChecklist && <th>Excepción</th>}
                {!esChecklist && <th title="Fecha en que se registró el proveedor">Registrado</th>}
                {!esChecklist && <th>Últ. actualización</th>}
                {!esChecklist && <th title="Calificación general de Nova: promedio del puntaje del proveedor en sus compras valoradas">Calificación Nova</th>}
                {conEstado && <th>Estado</th>}
                {conMotivo && <th>{pestana === "por_registrar" ? "Situación" : "Motivo"}</th>}
                {esChecklist && Object.entries(CORTOS).map(([clave, corto]) => <th key={clave} className="prov-chk-col" title={clave}>{corto}</th>)}
                {pestana === "excepciones" && <th>Checklist</th>}
                {pestana === "excepciones" && <th>Radica facturas</th>}
                {(esChecklist || conEstado) && <th>Avance</th>}
                <th className="actions-col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {visibles.length === 0 && (
                <tr><td colSpan={columnas} style={{ textAlign: "center", color: "var(--muted)", padding: 28 }}>No hay proveedores en esta pestaña.</td></tr>
              )}
              {visibles.map((r) => {
                const completo = r.ciclo && r.checklist.completos === r.checklist.total;
                const editable = canEdit && !!r.ciclo;
                return (
                  <tr key={r.nit}>
                    {seleccionable && (
                      <td>
                        {r.ciclo ? <input type="checkbox" checked={seleccion.has(r.nit)} onChange={() => alternarSeleccion(r.nit)} aria-label={`Seleccionar ${r.nombre}`} /> : null}
                      </td>
                    )}
                    <td className="truncate prov-name-cell">
                      <span className="desc-tooltip-wrap">
                        <span className="desc-text"><strong>{r.nombre}</strong></span>
                        <span className="desc-tooltip-bubble">{r.nombre}</span>
                      </span>
                    </td>
                    <td className="mono">{r.nit}</td>
                    {esChecklist && <td><span className="pill accent">{r.clasificacionLabel}</span></td>}
                    {esChecklist && (
                      <td>
                        {canEdit && r.ciclo ? (
                          <select
                            className="prov-estado-select"
                            value={r.ciclo.estado}
                            disabled={ocupado}
                            aria-label={`Estado de ${r.nombre}`}
                            onChange={(e) => cambiarEstado(r, e.target.value)}
                          >
                            {ESTADOS.map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}
                          </select>
                        ) : (
                          <span className={`pill ${PILL_ESTADO[r.ciclo?.estado] || "muted"}`}>{r.ciclo?.estadoLabel || "—"}</span>
                        )}
                      </td>
                    )}
                    {esChecklist && <td>{celdaCriticidad(r)}</td>}
                    <td className="truncate">{r.area || "—"}</td>
                    {esChecklist && <td className="mono">{fmtFecha(r.fechaActualizacion)}</td>}
                    {!esChecklist && <td>{celdaCriticidad(r)}</td>}
                    {!esChecklist && <td className="truncate">{celdaTexto(r.clasificacionMonto)}</td>}
                    {!esChecklist && <td className="truncate">{celdaTexto(r.servicio)}</td>}
                    {!esChecklist && <td>{r.esExcepcion ? <span className="pill accent">Sí</span> : <span className="pill muted">No</span>}</td>}
                    {!esChecklist && <td className="mono">{r.clasificacion === "por_registrar" ? <span className="muted">Sin registrar</span> : fmtFecha(r.createdAt)}</td>}
                    {!esChecklist && <td className="mono">{fmtFecha(r.fechaActualizacion)}</td>}
                    {!esChecklist && (
                      <td>
                        {r.valoracionIA
                          ? <ValoracionPuntaje puntaje={r.valoracionIA.promedio} decimales titulo={`Promedio de ${r.valoracionIA.cantidad} compra(s) valoradas`} />
                          : <span className="muted" title="Sin compras valoradas por Nova">—</span>}
                      </td>
                    )}
                    {conEstado && (
                      <td>
                        {!r.ciclo ? <span className="pill muted">{r.clasificacionLabel}</span> : editable ? (
                          <select
                            className="prov-estado-select"
                            value={r.ciclo.estado}
                            disabled={ocupado}
                            aria-label={`Estado de ${r.nombre}`}
                            onChange={(e) => cambiarEstado(r, e.target.value)}
                          >
                            {ESTADOS.map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}
                          </select>
                        ) : <span className={`pill ${PILL_ESTADO[r.ciclo.estado]}`}>{r.ciclo.estadoLabel}</span>}
                      </td>
                    )}
                    {conMotivo && <td>{motivoFila(r)}</td>}
                    {esChecklist && r.checklist.items.map((it) => (
                      <td key={it.clave} className="prov-chk-col">
                        <button
                          type="button"
                          className={`prov-chk${it.cumple ? " on" : ""}${it.cumple && !it.marcado && it.auto ? " auto" : ""}`}
                          aria-pressed={it.cumple}
                          aria-label={`${it.label}: ${it.cumple ? "cumple" : "pendiente"}`}
                          title={`${it.label} — ${it.cumple ? (it.marcado ? "cumple (marcado a mano)" : "cumple (automático)") : "pendiente"}`}
                          disabled={!editable}
                          onClick={() => alternarRequisito(r, it.clave, !it.cumple)}
                        >{it.cumple ? "✓" : ""}</button>
                      </td>
                    ))}
                    {pestana === "excepciones" && (
                      <td><span className={`pill ${r.checklist.completos === r.checklist.total ? "good" : "warning"}`}>{r.checklist.completos}/{r.checklist.total}</span></td>
                    )}
                    {pestana === "excepciones" && (
                      <td>
                        <input type="checkbox" role="switch" className="prov-switch" checked={!!r.radicaFacturas} disabled={!canEdit} aria-label={`${r.nombre} radica facturas`} onChange={(e) => alternarRadicacion(r, e.target.checked)} />
                      </td>
                    )}
                    {(esChecklist || conEstado) && (
                      <td>
                        {r.ciclo ? <span className={`pill ${completo ? "good" : "warning"}`}>{r.checklist.completos}/{r.checklist.total}</span> : "—"}
                      </td>
                    )}
                    <td className="actions-cell">
                      <div className="row-actions">
                        <button type="button" className="icon-action-btn" onClick={() => setDetalleId(r.nit)} title="Ver detalle" aria-label={`Ver detalle de ${r.nombre}`}>
                          <IconEye size={14} />
                        </button>
                        {canEdit && (
                          <button type="button" className="icon-action-btn edit" onClick={() => setEditando(r)} title="Editar" aria-label={`Editar ${r.nombre}`}>
                            <IconEdit size={13} />
                          </button>
                        )}
                        {canEdit && (
                          <button
                            type="button"
                            className="icon-action-btn delete"
                            onClick={() => setEliminando(r)}
                            disabled={r.registrosCompras > 0}
                            title={r.registrosCompras > 0
                              ? `No se puede eliminar: lo usan ${r.registrosCompras} registro(s) de compra. Márcalo como inactivo desde Editar.`
                              : "Eliminar"}
                            aria-label={`Eliminar ${r.nombre}`}
                          >
                            <IconTrash size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="table-footer">
          <div className="field" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <label htmlFor="prov-pagesize" style={{ marginBottom: 0 }}>Tamaño</label>
            <select id="prov-pagesize" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
              {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="page-btns">
            <button type="button" className="btn small" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Anterior</button>
            <button type="button" className="btn small" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>Siguiente</button>
          </div>
          <span className="count-note">Página {currentPage} de {totalPages}</span>
          <div className="spacer" />
          <span className="count-note">{filas.length} proveedor(es) (de {data.total})</span>
        </div>
      </div>

      {detalleId && (
        <ProveedorDetalleModal
          proveedorNit={detalleId}
          catalogos={catalogos}
          canEdit={canEdit}
          onClose={() => setDetalleId(null)}
          onChanged={() => recargar()}
        />
      )}
      {creando && (
        <ProveedorFormModal
          catalogos={catalogos}
          onClose={() => setCreando(false)}
          onSaved={(p) => { setCreando(false); recargar(); setDetalleId(p.nit); }}
        />
      )}
      {editando && (
        <ProveedorFormModal
          proveedor={editando}
          catalogos={catalogos}
          inicioCiclo={data.inicioCiclo}
          onClose={() => setEditando(null)}
          onSaved={() => { setEditando(null); recargar(); }}
          onClasificado={() => { setEditando(null); recargar(); }}
        />
      )}
      {informe && <InformeMensualModal onClose={() => setInforme(false)} />}
      {aprobando && (
        <FechaActualizacionModal
          titulo={aprobando.titulo}
          inicioCiclo={data.inicioCiclo}
          onCancel={() => setAprobando(null)}
          onConfirm={async (fecha) => { const { aplicar } = aprobando; setAprobando(null); await aplicar(fecha); }}
        />
      )}
      {eliminando && (
        <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !borrando) setEliminando(null); }}>
          <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="prov-eliminar-t" style={{ maxWidth: 460 }}>
            <div className="modal-head">
              <h3 id="prov-eliminar-t">Eliminar proveedor</h3>
              <button type="button" className="btn-ghost icon-btn" onClick={() => setEliminando(null)} disabled={borrando} aria-label="Cerrar">✕</button>
            </div>
            <div className="modal-body" style={{ display: "block" }}>
              <p style={{ marginTop: 0 }}>¿Eliminar <strong>{eliminando.nombre}</strong> (NIT <span className="mono">{eliminando.nit}</span>)?</p>
              <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>
                Se borran también su historial de ciclos y su checklist. Ningún registro de compra lo usa, así que no se pierde información de Compras. Queda constancia en Auditoría. Esta acción no se puede deshacer.
              </p>
            </div>
            <div className="modal-foot">
              <div className="spacer" />
              <button type="button" className="btn" onClick={() => setEliminando(null)} disabled={borrando}>Cancelar</button>
              <button type="button" className="btn btn-danger-solid" onClick={confirmarEliminar} disabled={borrando}>
                {borrando ? <span className="spinner" /> : <IconTrash size={13} />} Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
