"use client";

import { useEffect, useMemo, useState } from "react";
import RecordModal from "@/components/RecordModal";
import { fmtCOP } from "@/lib/format";
import { getDiasInfo } from "@/lib/diasInfo";
import { patchRecordApi, deleteRecordApi, searchFiltersWithAiApi } from "@/lib/api";
import { canCreateRecord, canEditRecord, canDeleteRecord, canToggleRadicado, getEditableFields } from "@/lib/roles";
import { IconPlus, IconEdit, IconTrash, IconCheck, IconAlert, IconSpark, IconSearch } from "@/components/icons";

const PAGE_SIZES = [25, 50, 100, 250];

const COLUMNS = [
  { key: "localSeq", label: "#" },
  { key: "fechaSolicitud", label: "F. solicitud" },
  { key: "fechaEntrega", label: "F. entrega" },
  { key: "dias", label: "Días" },
  { key: "area", label: "Área" },
  { key: "responsable", label: "Responsable" },
  { key: "estado", label: "Estado de compra" },
  { key: "categoria", label: "Categoría" },
  { key: "descripcion", label: "Descripción" },
  { key: "medioPago", label: "Medio de pago" },
  { key: "licitacion", label: "Licitación" },
  { key: "estadoLegalizacion", label: "Estado legaliz." },
  { key: "proveedor", label: "Proveedor" },
  { key: "fe", label: "FE" },
  { key: "valorConIva", label: "Valor + IVA" },
  { key: "valorSinIva", label: "Valor sin IVA" },
  { key: "valorCot", label: "Valor Cot." },
  { key: "observaciones", label: "Observaciones" },
];

function estadoPillClass(estado) {
  if (estado === "Ejecutado") return "good";
  if (estado === "Proceso") return "warning";
  if (estado === "Anulado") return "critical";
  return "muted";
}

function legalizacionPillClass(v) {
  if (v === "Legalizado") return "good";
  if (v === "Pendiente") return "warning";
  if (v === "Rechazado") return "critical";
  return "muted";
}

function uniqueSorted(records, field) {
  const set = new Set();
  for (const r of records) {
    if (r[field]) set.add(r[field]);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
}

function sortValue(r, key) {
  if (key === "dias") return getDiasInfo(r).dias ?? -Infinity;
  const v = r[key];
  if (v === null || v === undefined) return "";
  return v;
}

export default function RegistrosView({ records, setRecords, onFilteredChange, currentUser, maestros, presupuestos = [] }) {
  const role = currentUser?.role;
  const permissions = currentUser?.permissions;
  const allowCreate = permissions?.createRecord ?? canCreateRecord(role);
  const allowEdit = permissions?.editRecord ?? canEditRecord(role);
  const allowDelete = permissions?.deleteRecord ?? canDeleteRecord(role);
  const allowToggle = permissions?.toggleRadicado ?? canToggleRadicado(role);
  const editableFields = getEditableFields(role);
  const hasRowActions = allowToggle || allowEdit || allowDelete;

  const [search, setSearch] = useState("");
  const [area, setArea] = useState("");
  const [estado, setEstado] = useState("");
  const [medioPago, setMedioPago] = useState("");
  const [licitacion, setLicitacion] = useState("");
  const [estadoLegalizacion, setEstadoLegalizacion] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [valorMin, setValorMin] = useState("");
  const [valorMax, setValorMax] = useState("");
  const [onlyIncumplimiento, setOnlyIncumplimiento] = useState(false);

  // Modo de búsqueda: "manual" (filtros de siempre) o "ia" (lenguaje natural,
  // traducido a esos mismos filtros — un solo motor de filtrado para ambos).
  const [searchMode, setSearchMode] = useState("manual");
  const [aiQuery, setAiQuery] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiApplied, setAiApplied] = useState(null); // resumen de lo último que aplicó la IA

  const [sortKey, setSortKey] = useState("fechaSolicitud");
  const [sortDir, setSortDir] = useState("desc");

  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(1);

  const [modalRecord, setModalRecord] = useState(undefined); // undefined = closed, null = new
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [togglingId, setTogglingId] = useState(null);
  const [confirmRadicado, setConfirmRadicado] = useState(null); // registro pendiente de confirmar

  const areaOptions = useMemo(() => uniqueSorted(records, "area"), [records]);
  const estadoOptions = useMemo(() => uniqueSorted(records, "estado"), [records]);
  const medioOptions = useMemo(() => uniqueSorted(records, "medioPago"), [records]);
  const licitacionOptions = useMemo(() => uniqueSorted(records, "licitacion"), [records]);
  const estadoLegalizacionOptions = useMemo(() => uniqueSorted(records, "estadoLegalizacion"), [records]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter((r) => {
      if (q) {
        const hay = [
          r.localSeq ? `#${r.localSeq}` : "",
          r.fechaSolicitud,
          r.fechaEntrega,
          r.area,
          r.responsable,
          r.estado,
          r.categoria,
          r.descripcion,
          r.medioPago,
          r.licitacion,
          r.estadoLegalizacion,
          r.proveedor,
          r.fe,
          r.valorConIva,
          r.valorSinIva,
          r.valorCot,
          r.observaciones,
        ]
          .filter((v) => v !== null && v !== undefined && v !== "")
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (area && r.area !== area) return false;
      if (estado && r.estado !== estado) return false;
      if (medioPago && r.medioPago !== medioPago) return false;
      if (licitacion && String(r.licitacion || "") !== licitacion) return false;
      if (estadoLegalizacion && r.estadoLegalizacion !== estadoLegalizacion) return false;
      if (dateFrom && (!r.fechaSolicitud || r.fechaSolicitud < dateFrom)) return false;
      if (dateTo && (!r.fechaSolicitud || r.fechaSolicitud > dateTo)) return false;
      if (valorMin !== "" && !(r.valorConIva >= Number(valorMin))) return false;
      if (valorMax !== "" && !(r.valorConIva <= Number(valorMax))) return false;
      if (onlyIncumplimiento && !((getDiasInfo(r).dias ?? 0) > 8)) return false;
      return true;
    });
  }, [records, search, area, estado, medioPago, licitacion, estadoLegalizacion, dateFrom, dateTo, valorMin, valorMax, onlyIncumplimiento]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      let cmp;
      if (typeof va === "number" && typeof vb === "number") {
        cmp = va - vb;
      } else {
        cmp = String(va).localeCompare(String(vb), "es");
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  useEffect(() => {
    onFilteredChange?.(sorted);
  }, [sorted, onFilteredChange]);

  useEffect(() => {
    setPage(1);
  }, [search, area, estado, medioPago, licitacion, dateFrom, dateTo, valorMin, valorMax, onlyIncumplimiento, pageSize]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, currentPage, pageSize]);

  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function clearFilters() {
    setSearch("");
    setArea("");
    setEstado("");
    setMedioPago("");
    setLicitacion("");
    setEstadoLegalizacion("");
    setDateFrom("");
    setDateTo("");
    setValorMin("");
    setValorMax("");
    setOnlyIncumplimiento(false);
    setAiApplied(null);
    setAiError("");
  }

  // Traduce aiQuery a los mismos filtros de arriba (vía Anthropic, del lado
  // del servidor) y los aplica — el filtrado en sí sigue
  // siendo el mismo useMemo de siempre, no hay un motor de filtrado aparte.
  async function handleAiSearch() {
    const q = aiQuery.trim();
    if (!q || aiLoading) return;
    setAiLoading(true);
    setAiError("");
    try {
      const { filters } = await searchFiltersWithAiApi(q, {
        areas: areaOptions,
        estados: estadoOptions,
        medios: medioOptions,
        licitaciones: licitacionOptions,
        estadosLegalizacion: estadoLegalizacionOptions,
      });
      setSearch(filters.search || "");
      setArea(filters.area || "");
      setEstado(filters.estado || "");
      setMedioPago(filters.medioPago || "");
      setLicitacion(filters.licitacion || "");
      setEstadoLegalizacion(filters.estadoLegalizacion || "");
      setDateFrom(filters.dateFrom || "");
      setDateTo(filters.dateTo || "");
      setValorMin(filters.valorMin != null ? String(filters.valorMin) : "");
      setValorMax(filters.valorMax != null ? String(filters.valorMax) : "");
      setOnlyIncumplimiento(!!filters.onlyIncumplimiento);
      setAiApplied(filters);
    } catch (err) {
      setAiError(err.message || "No se pudo interpretar la búsqueda.");
      setAiApplied(null);
    } finally {
      setAiLoading(false);
    }
  }

  // El radicado es de un solo sentido: una vez marcado no se puede desmarcar
  // (ni en la UI ni en el backend), así que solo se pide confirmar al marcar.
  function requestRadicado(r) {
    if (!allowToggle || togglingId || r.radicado) return;
    setConfirmRadicado(r);
  }

  async function confirmMarkRadicado() {
    const r = confirmRadicado;
    if (!r) return;
    setConfirmRadicado(null);
    setTogglingId(r.id);
    setRecords((prev) => prev.map((x) => (x.id === r.id ? { ...x, radicado: true } : x)));
    try {
      await patchRecordApi(r.id, { radicado: true });
    } catch {
      setRecords((prev) => prev.map((x) => (x.id === r.id ? { ...x, radicado: false } : x)));
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDelete(id) {
    if (!allowDelete) return;
    setDeletingId(id);
    try {
      await deleteRecordApi(id);
      setRecords((prev) => prev.filter((x) => x.id !== id));
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  }

  function handleSaved(saved, isEdit) {
    setRecords((prev) => {
      if (isEdit) return prev.map((x) => (x.id === saved.id ? saved : x));
      return [...prev, saved];
    });
    setModalRecord(undefined);
  }

  function handleDeletedFromModal(id) {
    setRecords((prev) => prev.filter((x) => x.id !== id));
    setModalRecord(undefined);
  }

  return (
    <div>
      <div className="toolbar" id="registros-toolbar" style={{ flexDirection: "column", alignItems: "stretch" }}>
        <div className="dash-tabs" role="tablist" aria-label="Modo de búsqueda" style={{ alignSelf: "flex-start" }}>
          <button type="button" role="tab" aria-selected={searchMode === "manual"} className="dash-tab" onClick={() => setSearchMode("manual")}>
            Filtros manuales
          </button>
          <button type="button" role="tab" aria-selected={searchMode === "ia"} className="dash-tab" onClick={() => setSearchMode("ia")}>
            <IconSpark size={13} /> Buscar con IA
          </button>
        </div>

        {searchMode === "ia" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <div className="field search-field" style={{ flex: 1 }}>
                <label htmlFor="reg-ai-query">Describe qué buscas</label>
                <input
                  id="reg-ai-query" type="text"
                  placeholder="Ej. compras de infraestructura de más de 5 millones en julio…"
                  value={aiQuery}
                  onChange={(e) => setAiQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAiSearch()}
                  disabled={aiLoading}
                />
              </div>
              <button type="button" className="btn btn-primary" onClick={handleAiSearch} disabled={aiLoading || !aiQuery.trim()} style={{ alignSelf: "flex-end" }}>
                {aiLoading ? <span className="spinner" /> : <IconSearch size={13} />} {aiLoading ? "Buscando…" : "Buscar"}
              </button>
            </div>
            {aiError && <div className="modal-error"><IconAlert size={13} /> {aiError}</div>}
            {aiApplied && !aiError && (
              <div className="ai-applied-chips">
                <span className="chip">Entendí:</span>
                {aiApplied.area && <span className="chip">Área: {aiApplied.area}</span>}
                {aiApplied.estado && <span className="chip">Estado: {aiApplied.estado}</span>}
                {aiApplied.medioPago && <span className="chip">Medio de pago: {aiApplied.medioPago}</span>}
                {aiApplied.licitacion && <span className="chip">Licitación: {aiApplied.licitacion}</span>}
                {aiApplied.estadoLegalizacion && <span className="chip">Legalización: {aiApplied.estadoLegalizacion}</span>}
                {aiApplied.dateFrom && <span className="chip">Desde: {aiApplied.dateFrom}</span>}
                {aiApplied.dateTo && <span className="chip">Hasta: {aiApplied.dateTo}</span>}
                {aiApplied.valorMin != null && <span className="chip">Valor mín: {fmtCOP(aiApplied.valorMin)}</span>}
                {aiApplied.valorMax != null && <span className="chip">Valor máx: {fmtCOP(aiApplied.valorMax)}</span>}
                {aiApplied.search && <span className="chip">Texto: {aiApplied.search}</span>}
                {aiApplied.onlyIncumplimiento && <span className="chip">Solo incumplidas</span>}
                <span className="count-note">{sorted.length} resultado(s)</span>
              </div>
            )}
          </div>
        ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <div className="field search-field">
            <label htmlFor="reg-search">Buscar</label>
            <input
              id="reg-search" type="search" placeholder="Buscar en cualquier campo del registro…"
              value={search} onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="reg-area">Área</label>
            <select id="reg-area" value={area} onChange={(e) => setArea(e.target.value)}>
              <option value="">Todas</option>
              {areaOptions.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="reg-estado">Estado de compra</label>
            <select id="reg-estado" value={estado} onChange={(e) => setEstado(e.target.value)}>
              <option value="">Todos</option>
              {estadoOptions.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="reg-medio">Medio de pago</label>
            <select id="reg-medio" value={medioPago} onChange={(e) => setMedioPago(e.target.value)}>
              <option value="">Todos</option>
              {medioOptions.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="reg-licitacion">Licitación</label>
            <select id="reg-licitacion" value={licitacion} onChange={(e) => setLicitacion(e.target.value)}>
              <option value="">Todas</option>
              {licitacionOptions.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="reg-estado-legal">Estado legalización</label>
            <select id="reg-estado-legal" value={estadoLegalizacion} onChange={(e) => setEstadoLegalizacion(e.target.value)}>
              <option value="">Todos</option>
              {estadoLegalizacionOptions.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="reg-from">Desde</label>
            <input id="reg-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="reg-to">Hasta</label>
            <input id="reg-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="reg-valor-min">Valor desde</label>
            <input id="reg-valor-min" type="number" min="0" placeholder="Ej. 5000000" value={valorMin} onChange={(e) => setValorMin(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="reg-valor-max">Valor hasta</label>
            <input id="reg-valor-max" type="number" min="0" placeholder="Ej. 20000000" value={valorMax} onChange={(e) => setValorMax(e.target.value)} />
          </div>
        </div>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
          <button
            type="button"
            className={`btn${onlyIncumplimiento ? " btn-danger-solid" : ""}`}
            onClick={() => setOnlyIncumplimiento((v) => !v)}
            aria-pressed={onlyIncumplimiento}
            title="Solicitudes en proceso o entregadas con más de 8 días hábiles"
          >
            <IconAlert size={13} /> Incumplimiento (&gt;8 días)
          </button>
          <button type="button" className="btn" onClick={clearFilters}>Limpiar filtros</button>
          <div className="spacer" />
          {allowCreate && (
            <button type="button" className="btn btn-primary" onClick={() => setModalRecord(null)}>
              <IconPlus size={13} /> Agregar registro
            </button>
          )}
        </div>
      </div>

      <div className="table-card">
        <div className="table-scroll">
          <table className="records">
            <thead>
              <tr>
                {COLUMNS.map((c) => (
                  <th
                    key={c.key}
                    className={sortKey === c.key ? "sorted" : ""}
                    onClick={() => toggleSort(c.key)}
                  >
                    {c.label}
                    <span className="arrow">
                      {sortKey !== c.key ? "↕" : sortDir === "asc" ? "↑" : "↓"}
                    </span>
                  </th>
                ))}
                <th className="actions-col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={COLUMNS.length + 1}>
                    <div className="empty">No hay registros que coincidan con los filtros.</div>
                  </td>
                </tr>
              )}
              {pageRows.map((r) => {
                const diasInfo = getDiasInfo(r);
                return (
                  <tr key={r.id}>
                    <td className="mono">{r.localSeq ? `#${r.localSeq}` : "—"}</td>
                    <td>{r.fechaSolicitud || "—"}</td>
                    <td>{r.fechaEntrega || "—"}</td>
                    <td><span className={`pill ${diasInfo.severity}`}>{diasInfo.label}</span></td>
                    <td>{r.area || "—"}</td>
                    <td>{r.responsable || "—"}</td>
                    <td><span className={`pill ${estadoPillClass(r.estado)}`}>{r.estado || "—"}</span></td>
                    <td className="truncate">{r.categoria || "—"}</td>
                    <td className="truncate wide">{r.descripcion || "—"}</td>
                    <td>{r.medioPago || "—"}</td>
                    <td className="truncate">{r.licitacion || "—"}</td>
                    <td><span className={`pill ${legalizacionPillClass(r.estadoLegalizacion)}`}>{r.estadoLegalizacion || "—"}</span></td>
                    <td className="truncate wide">{r.proveedor || "—"}</td>
                    <td className="mono cell-fe">{r.fe || "—"}</td>
                    <td className="num">{fmtCOP(r.valorConIva)}</td>
                    <td className="num">{fmtCOP(r.valorSinIva)}</td>
                    <td className="num">{fmtCOP(r.valorCot)}</td>
                    <td className="truncate wide">{r.observaciones || "—"}</td>
                    <td className="actions-cell">
                      {confirmDeleteId === r.id ? (
                        <div className="confirm-del">
                          <span>¿Eliminar?</span>
                          <button
                            type="button" className="btn btn-danger-solid small"
                            onClick={() => handleDelete(r.id)} disabled={deletingId === r.id}
                          >
                            {deletingId === r.id ? <span className="spinner" /> : "Sí"}
                          </button>
                          <button type="button" className="btn small" onClick={() => setConfirmDeleteId(null)} disabled={deletingId === r.id}>No</button>
                        </div>
                      ) : (
                        <div className="row-actions">
                          <button
                            type="button"
                            className={`icon-action-btn check${r.radicado ? " checked" : ""}`}
                            onClick={() => requestRadicado(r)}
                            aria-pressed={r.radicado}
                            title={
                              r.radicado
                                ? "Radicado (no se puede deshacer)"
                                : r.estadoLegalizacion !== "Legalizado"
                                  ? "Solo se puede radicar un registro con estado de legalización \"Legalizado\""
                                  : "Marcar como radicado"
                            }
                            disabled={!allowToggle || togglingId === r.id || r.radicado || r.estadoLegalizacion !== "Legalizado"}
                          >
                            {togglingId === r.id ? <span className="spinner" /> : <IconCheck size={13} />}
                          </button>
                          {allowEdit && (
                            <button type="button" className="icon-action-btn edit" onClick={() => setModalRecord(r)} title="Editar">
                              <IconEdit size={13} />
                            </button>
                          )}
                          {allowDelete && (
                            <button type="button" className="icon-action-btn delete" onClick={() => setConfirmDeleteId(r.id)} title="Eliminar">
                              <IconTrash size={13} />
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="table-footer">
          <div className="field" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <label htmlFor="reg-pagesize" style={{ marginBottom: 0 }}>Tamaño</label>
            <select id="reg-pagesize" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
              {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="page-btns">
            <button type="button" className="btn small" disabled={currentPage <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</button>
            <button type="button" className="btn small" disabled={currentPage >= totalPages} onClick={() => setPage((p) => p + 1)}>Siguiente</button>
          </div>
          <span className="count-note">Página {currentPage} de {totalPages}</span>
          <div className="spacer" />
          <span className="count-note">{sorted.length} registro(s) (filtrado de {records.length})</span>
        </div>
      </div>

      {modalRecord !== undefined && (
        <RecordModal
          record={modalRecord}
          records={records}
          onClose={() => setModalRecord(undefined)}
          onSaved={handleSaved}
          onDeleted={handleDeletedFromModal}
          allowDelete={allowDelete}
          editableFields={modalRecord ? editableFields : null}
          maestros={maestros}
          presupuestos={presupuestos}
        />
      )}

      {confirmRadicado && (
        <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setConfirmRadicado(null); }}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-head">
              <h3>Marcar como radicado</h3>
              <button type="button" className="btn-ghost icon-btn" onClick={() => setConfirmRadicado(null)} aria-label="Cerrar">✕</button>
            </div>
            <div className="modal-body" style={{ gridTemplateColumns: "1fr" }}>
              <p style={{ margin: 0 }}>
                ¿Confirmas que el registro {confirmRadicado.localSeq ? `#${confirmRadicado.localSeq}` : ""}
                {confirmRadicado.descripcion ? ` — ${confirmRadicado.descripcion}` : ""} ya fue radicado?
              </p>
              <p className="count-note" style={{ margin: 0 }}>
                Esta acción no se puede deshacer: una vez marcado, nadie podrá desmarcarlo.
              </p>
            </div>
            <div className="modal-foot">
              <button type="button" className="btn btn-primary" onClick={confirmMarkRadicado}>
                Sí, marcar como radicado
              </button>
              <button type="button" className="btn" onClick={() => setConfirmRadicado(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
