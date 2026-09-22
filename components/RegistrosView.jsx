"use client";

import { useEffect, useMemo, useState } from "react";
import RecordModal from "@/components/RecordModal";
import { fmtPesos } from "@/lib/format";
import { getDiasInfo } from "@/lib/diasInfo";
import { patchRecordApi, deleteRecordApi } from "@/lib/api";
import { canCreateRecord, canEditRecord, canDeleteRecord, canToggleRadicado } from "@/lib/roles";
import { IconPlus, IconEdit, IconTrash, IconCheck } from "@/components/icons";

const PAGE_SIZES = [25, 50, 100, 250];

const COLUMNS = [
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
  if (v === "ACTA") return "good";
  if (v === "OC") return "warning";
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

export default function RegistrosView({ records, setRecords, onFilteredChange, currentUser }) {
  const role = currentUser?.role;
  const allowCreate = canCreateRecord(role);
  const allowEdit = canEditRecord(role);
  const allowDelete = canDeleteRecord(role);
  const allowToggle = canToggleRadicado(role);
  const hasRowActions = allowToggle || allowEdit || allowDelete;

  const [search, setSearch] = useState("");
  const [area, setArea] = useState("");
  const [estado, setEstado] = useState("");
  const [medioPago, setMedioPago] = useState("");
  const [licitacion, setLicitacion] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [sortKey, setSortKey] = useState("fechaSolicitud");
  const [sortDir, setSortDir] = useState("desc");

  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(1);

  const [modalRecord, setModalRecord] = useState(undefined); // undefined = closed, null = new
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [togglingId, setTogglingId] = useState(null);

  const areaOptions = useMemo(() => uniqueSorted(records, "area"), [records]);
  const estadoOptions = useMemo(() => uniqueSorted(records, "estado"), [records]);
  const medioOptions = useMemo(() => uniqueSorted(records, "medioPago"), [records]);
  const licitacionOptions = useMemo(() => uniqueSorted(records, "licitacion"), [records]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter((r) => {
      if (q) {
        const hay = [r.descripcion, r.proveedor, r.responsable, r.categoria, r.observaciones]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (area && r.area !== area) return false;
      if (estado && r.estado !== estado) return false;
      if (medioPago && r.medioPago !== medioPago) return false;
      if (licitacion && String(r.licitacion || "") !== licitacion) return false;
      if (dateFrom && (!r.fechaSolicitud || r.fechaSolicitud < dateFrom)) return false;
      if (dateTo && (!r.fechaSolicitud || r.fechaSolicitud > dateTo)) return false;
      return true;
    });
  }, [records, search, area, estado, medioPago, licitacion, dateFrom, dateTo]);

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
  }, [search, area, estado, medioPago, licitacion, dateFrom, dateTo, pageSize]);

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
    setDateFrom("");
    setDateTo("");
  }

  async function toggleRadicado(r) {
    if (!allowToggle || togglingId) return;
    const next = !r.radicado;
    setTogglingId(r.id);
    setRecords((prev) => prev.map((x) => (x.id === r.id ? { ...x, radicado: next } : x)));
    try {
      await patchRecordApi(r.id, { radicado: next });
    } catch {
      setRecords((prev) => prev.map((x) => (x.id === r.id ? { ...x, radicado: r.radicado } : x)));
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
      <div className="toolbar" id="registros-toolbar">
        <div className="field search-field">
          <label htmlFor="reg-search">Buscar</label>
          <input
            id="reg-search" type="search" placeholder="Descripción, proveedor, responsable…"
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
          <label htmlFor="reg-from">Desde</label>
          <input id="reg-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="reg-to">Hasta</label>
          <input id="reg-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <button type="button" className="btn" onClick={clearFilters}>Limpiar filtros</button>
        <div className="spacer" />
        {allowCreate && (
          <button type="button" className="btn btn-primary" onClick={() => setModalRecord(null)}>
            <IconPlus size={13} /> Agregar registro
          </button>
        )}
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
                    <td>{r.fechaSolicitud || "—"}</td>
                    <td>{r.fechaEntrega || "—"}</td>
                    <td><span className={`pill ${diasInfo.severity}`}>{diasInfo.label}</span></td>
                    <td>{r.area || "—"}</td>
                    <td>{r.responsable || "—"}</td>
                    <td><span className={`pill ${estadoPillClass(r.estado)}`}>{r.estado || "—"}</span></td>
                    <td className="truncate">{r.categoria || "—"}</td>
                    <td className="desc-cell">{r.descripcion || "—"}</td>
                    <td>{r.medioPago || "—"}</td>
                    <td className="truncate">{r.licitacion || "—"}</td>
                    <td><span className={`pill ${legalizacionPillClass(r.estadoLegalizacion)}`}>{r.estadoLegalizacion || "—"}</span></td>
                    <td className="truncate wide">{r.proveedor || "—"}</td>
                    <td className="mono">{r.fe || "—"}</td>
                    <td className="num">{fmtPesos(r.valorConIva)}</td>
                    <td className="num">{fmtPesos(r.valorSinIva)}</td>
                    <td className="num">{fmtPesos(r.valorCot)}</td>
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
                            onClick={() => toggleRadicado(r)}
                            aria-pressed={r.radicado}
                            title="Radicado"
                            disabled={!allowToggle || togglingId === r.id}
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
        />
      )}
    </div>
  );
}
