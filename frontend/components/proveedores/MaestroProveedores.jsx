"use client";

import { useState } from "react";
import {
  fetchMaestroProveedores, cambiarEstadoCicloApi, cambiarClasificacionApi, setDocumentoCicloApi, accionMasivaProveedoresApi,
} from "@/lib/api";
import { IconPlus, IconSpark, IconEye, IconEdit, IconInfo } from "@/components/icons";
import BuscarConNova from "@/components/proveedores/BuscarConNova";
import ProveedorDetalleModal from "@/components/proveedores/ProveedorDetalleModal";
import ProveedorFormModal from "@/components/proveedores/ProveedorFormModal";
import InformeMensualModal from "@/components/proveedores/InformeMensualModal";
import { usePantallaNova } from "@/lib/novaPantalla";

const VACIO = { q: "", clasificacion: [], estado: [], checklist: "", criticidad: "", areaId: "" };
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
export default function MaestroProveedores({ initial, areas = [], motivos = [], canEdit }) {
  const [data, setData] = useState(initial);
  const [filters, setFilters] = useState(VACIO);
  const [searchMode, setSearchMode] = useState("manual");
  const [pestana, setPestana] = useState(() => {
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
      criticidad: f.criticidad || "",
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
  async function cambiarEstado(r, estado) {
    setError("");
    setAviso("");
    setOcupado(true);
    try {
      await cambiarEstadoCicloApi(r.id, estado);
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
      await cambiarClasificacionApi(r.id, { accion: "radicar", radica });
    } catch (err) {
      setError(err.message || "No se pudo guardar la radicación.");
    }
    recargar();
  }

  // Marcar o desmarcar un requisito del checklist con un clic (se refleja al instante).
  async function alternarRequisito(r, clave, cumple) {
    setError("");
    setData((d) => ({ ...d, rows: d.rows.map((x) => (x.id === r.id ? conRequisito(x, clave, cumple) : x)) }));
    try {
      await setDocumentoCicloApi(r.id, clave, cumple);
    } catch (err) {
      setError(err.message || "No se pudo guardar el requisito.");
    }
    recargar();
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
  const todosMarcados = visibles.filter((r) => r.ciclo).length > 0 && visibles.filter((r) => r.ciclo).every((r) => seleccion.has(r.id));
  const hayFiltros = JSON.stringify(filters) !== JSON.stringify(VACIO);
  usePantallaNova(
    `Pantalla Gestión de proveedores (ciclo ${data.anio}, corte en ${data.diasParaCorte} días). Pestaña activa: ${actual.label} con ${filas.length} proveedores${conToggle && soloIncompletos[pestana] ? " (solo con checklist incompleto)" : ""}. Conteos por pestaña: ${PESTANAS.map((p) => `${p.label} ${conteos[p.key]}`).join(", ")}. Filtros activos: ${hayFiltros ? "sí" : "ninguno"}.${seleccion.size ? ` Seleccionados: ${seleccion.size}.` : ""}`
  );
  const columnas = 6 + (esChecklist ? 12 : conEstado ? 4 : 2) + (seleccionable ? 1 : 0);

  function alternarSeleccion(id) {
    const n = new Set(seleccion);
    if (n.has(id)) n.delete(id); else n.add(id);
    setSeleccion(n);
  }

  function alternarTodos() {
    const n = new Set(seleccion);
    const ids = visibles.filter((r) => r.ciclo).map((r) => r.id);
    if (todosMarcados) ids.forEach((id) => n.delete(id)); else ids.forEach((id) => n.add(id));
    setSeleccion(n);
  }

  return (
    <div className="prov-maestro">
      <div className="toolbar" style={{ flexDirection: "column", alignItems: "stretch" }}>
        <div className="dash-tabs" role="tablist" aria-label="Modo de búsqueda" style={{ alignSelf: "flex-start" }}>
          <button type="button" role="tab" aria-selected={searchMode === "manual"} className="dash-tab" onClick={() => setSearchMode("manual")}>
            Filtros manuales
          </button>
          <button type="button" role="tab" aria-selected={searchMode === "ia"} className="dash-tab" onClick={() => setSearchMode("ia")}>
            <IconSpark size={13} /> Buscar con Nova
          </button>
        </div>

        {searchMode === "ia" ? (
          <BuscarConNova areas={areas} onApply={aplicarNova} onClear={limpiar} />
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <div className="field search-field">
              <label htmlFor="prov-q">Buscar</label>
              <input id="prov-q" type="search" placeholder="Nombre o NIT…" value={filters.q} onChange={(e) => cambiar({ q: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="prov-area">Área</label>
              <select id="prov-area" value={filters.areaId} onChange={(e) => cambiar({ areaId: e.target.value })}>
                <option value="">Todas</option>
                {areas.map((a) => <option key={a.id} value={a.id}>{a.valor}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="prov-crit">Criticidad</label>
              <select id="prov-crit" value={filters.criticidad} onChange={(e) => cambiar({ criticidad: e.target.value })}>
                <option value="">Todas</option>
                <option value="Critico">Crítico</option>
                <option value="No crítico">No crítico</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="prov-estado">Estado</label>
              <select id="prov-estado" value={filters.estado[0] || ""} onChange={(e) => cambiar({ estado: e.target.value ? [e.target.value] : [] })}>
                <option value="">Todos</option>
                {ESTADOS.map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="prov-check">Checklist</label>
              <select id="prov-check" value={filters.checklist} onChange={(e) => cambiar({ checklist: e.target.value })}>
                <option value="">Todos</option>
                <option value="completo">Completo</option>
                <option value="incompleto">Incompleto</option>
              </select>
            </div>
          </div>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
          <button type="button" className="btn" onClick={limpiar}>Limpiar filtros</button>
          <button type="button" className="btn" onClick={() => setInforme(true)}>Informe mensual</button>
          <div className="spacer" />
          {canEdit && (
            <button type="button" className="btn btn-primary" onClick={() => setCreando(true)}>
              <IconPlus size={13} /> Nuevo proveedor
            </button>
          )}
        </div>
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
          <button type="button" className="btn small" disabled={ocupado} onClick={() => accionMasiva({ tipo: "estado", estado: estadoMasivo }, `Estado «${ESTADOS.find((e) => e.key === estadoMasivo)?.label}»`)}>Aplicar</button>
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
                {esChecklist && <th>Criticidad</th>}
                <th>Área</th>
                {!esChecklist && <th>Criticidad</th>}
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
                  <tr key={r.id}>
                    {seleccionable && (
                      <td>
                        {r.ciclo ? <input type="checkbox" checked={seleccion.has(r.id)} onChange={() => alternarSeleccion(r.id)} aria-label={`Seleccionar ${r.nombre}`} /> : null}
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
                    {esChecklist && <td>{r.criticidad === "Critico" ? <span className="pill critical">Crítico</span> : (r.criticidad || "Sin definir")}</td>}
                    <td className="truncate" title={r.servicio || undefined}>{r.area || "—"}</td>
                    {!esChecklist && <td>{r.criticidad === "Critico" ? <span className="pill critical">Crítico</span> : (r.criticidad || "Sin definir")}</td>}
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
                        <button type="button" className="icon-action-btn" onClick={() => setDetalleId(r.id)} title="Ver detalle" aria-label={`Ver detalle de ${r.nombre}`}>
                          <IconEye size={14} />
                        </button>
                        {canEdit && (
                          <button type="button" className="icon-action-btn edit" onClick={() => setEditando(r)} title="Editar" aria-label={`Editar ${r.nombre}`}>
                            <IconEdit size={13} />
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
          proveedorId={detalleId}
          areas={areas}
          motivos={motivos}
          canEdit={canEdit}
          onClose={() => setDetalleId(null)}
          onChanged={() => recargar()}
        />
      )}
      {creando && (
        <ProveedorFormModal
          areas={areas}
          onClose={() => setCreando(false)}
          onSaved={(p) => { setCreando(false); recargar(); setDetalleId(p.id); }}
        />
      )}
      {editando && (
        <ProveedorFormModal
          proveedor={editando}
          areas={areas}
          onClose={() => setEditando(null)}
          onSaved={() => { setEditando(null); recargar(); }}
          onClasificado={() => { setEditando(null); recargar(); }}
        />
      )}
      {informe && <InformeMensualModal onClose={() => setInforme(false)} />}
    </div>
  );
}
