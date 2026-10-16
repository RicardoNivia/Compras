"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fmtPesos } from "@/lib/format";
import { ACTION_LABELS, ENTITY_LABELS } from "@/lib/auditLabels";
import { auditSearchFiltersWithAiApi } from "@/lib/api";
import { IconSpark, IconSearch, IconAlert } from "@/components/icons";

const ACTION_PILL = {
  crear: "good",
  editar: "warning",
  eliminar: "critical",
  radicar: "secondary",
  revocar: "critical",
  consultar: "muted",
};

const MONEY_FIELDS = new Set(["valorConIva", "valorSinIva", "valorCot"]);

function fmtValue(field, v) {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean" || v === "true" || v === "false") return v === true || v === "true" ? "Sí" : "No";
  if (MONEY_FIELDS.has(field)) return fmtPesos(Number(v));
  return String(v);
}

function fmtDateTime(iso) {
  try {
    return new Date(iso).toLocaleString("es-CO", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function AuditRow({ log }) {
  const [open, setOpen] = useState(false);
  const hasChanges = log.changes && log.changes.length > 0;

  return (
    <tr>
      <td style={{ whiteSpace: "nowrap" }}>{fmtDateTime(log.createdAt)}</td>
      <td>
        <div className="audit-user">
          <span className="audit-user-name">{log.userNombre || "—"}</span>
          {log.userEmail && <span className="audit-user-email">{log.userEmail}</span>}
        </div>
      </td>
      <td><span className={`pill ${ACTION_PILL[log.action] || "muted"}`}>{ACTION_LABELS[log.action] || log.action}</span></td>
      <td style={{ whiteSpace: "nowrap" }}>{ENTITY_LABELS[log.entityType] || log.entityType}</td>
      <td className="truncate wide" title={log.recordInfo || ""} style={{ maxWidth: 480 }}>
        {log.recordInfo || "—"}
        {hasChanges && (
          <>
            <button type="button" className="audit-expand-btn" onClick={() => setOpen((v) => !v)}>
              {open ? "Ocultar cambios" : `Ver cambios (${log.changes.length})`}
            </button>
            {open && (
              <div className="audit-changes">
                {log.changes.map((c, i) => (
                  <div key={i} className="audit-change-row">
                    <span className="audit-change-label">{c.label}</span>
                    <span className="audit-change-before">{fmtValue(c.field, c.before)}</span>
                    <span className="audit-change-arrow">→</span>
                    <span className="audit-change-after">{fmtValue(c.field, c.after)}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </td>
    </tr>
  );
}

export default function AuditoriaView({ initial, actors }) {
  const [logs, setLogs] = useState(initial?.logs || []);
  const [total, setTotal] = useState(initial?.total || 0);
  const [page, setPage] = useState(initial?.page || 1);
  const [pageSize] = useState(initial?.pageSize || 50);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [userId, setUserId] = useState("");
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [searchMode, setSearchMode] = useState("manual");
  const [aiQuery, setAiQuery] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiApplied, setAiApplied] = useState(null); // resumen de lo último que aplicó la IA

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const actorOptions = useMemo(
    () => (actors || []).filter((a) => a.id).sort((a, b) => (a.nombre || "").localeCompare(b.nombre || "")),
    [actors]
  );

  const fetchLogs = useCallback(async (opts) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (opts.from) params.set("from", opts.from);
      if (opts.to) params.set("to", opts.to);
      if (opts.userId) params.set("userId", opts.userId);
      if (opts.action) params.set("action", opts.action);
      if (opts.entityType) params.set("entityType", opts.entityType);
      params.set("page", String(opts.page));
      params.set("pageSize", String(pageSize));
      const res = await fetch(`/api/audit?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se pudo cargar la auditoría.");
      setLogs(data.logs || []);
      setTotal(data.total || 0);
      setPage(data.page || 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [pageSize]);

  useEffect(() => {
    fetchLogs({ from, to, userId, action, entityType, page: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, userId, action, entityType]);

  function goToPage(p) {
    if (p < 1 || p > totalPages) return;
    fetchLogs({ from, to, userId, action, entityType, page: p });
  }

  function clearFilters() {
    setFrom("");
    setTo("");
    setUserId("");
    setAction("");
    setEntityType("");
    setAiApplied(null);
    setAiError("");
  }

  // Traduce aiQuery a los mismos filtros de arriba (vía Anthropic, del lado
  // del servidor) y los aplica — el filtrado en sí sigue siendo el mismo
  // fetchLogs de siempre, no hay un motor de búsqueda aparte.
  async function handleAiSearch() {
    const q = aiQuery.trim();
    if (!q || aiLoading) return;
    setAiLoading(true);
    setAiError("");
    try {
      const { filters } = await auditSearchFiltersWithAiApi(q, { actors: actorOptions });
      setFrom(filters.dateFrom || "");
      setTo(filters.dateTo || "");
      setUserId(filters.userId || "");
      setAction(filters.action || "");
      setEntityType(filters.entityType || "");
      setAiApplied(filters);
    } catch (err) {
      setAiError(err.message || "No se pudo interpretar la búsqueda.");
      setAiApplied(null);
    } finally {
      setAiLoading(false);
    }
  }

  const aiActorNombre = aiApplied?.userId ? actorOptions.find((a) => a.id === aiApplied.userId)?.nombre : null;

  return (
    <div>
      <div className="toolbar" id="auditoria-toolbar" style={{ flexDirection: "column", alignItems: "stretch" }}>
        <div className="dash-tabs" role="tablist" aria-label="Modo de búsqueda" style={{ alignSelf: "flex-start" }}>
          <button type="button" role="tab" aria-selected={searchMode === "manual"} className="dash-tab" onClick={() => setSearchMode("manual")}>
            Filtros manuales
          </button>
          <button type="button" role="tab" aria-selected={searchMode === "ia"} className="dash-tab" onClick={() => setSearchMode("ia")}>
            <IconSpark size={13} /> Buscar con Nova
          </button>
        </div>

        {searchMode === "ia" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <div className="field search-field" style={{ flex: 1 }}>
                <label htmlFor="aud-ai-query">Describe qué buscas</label>
                <input
                  id="aud-ai-query" type="text"
                  placeholder="Ej. qué eliminó Carolina este mes…"
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
                {aiActorNombre && <span className="chip">Usuario: {aiActorNombre}</span>}
                {aiApplied.action && <span className="chip">Acción: {ACTION_LABELS[aiApplied.action] || aiApplied.action}</span>}
                {aiApplied.entityType && <span className="chip">Entidad: {ENTITY_LABELS[aiApplied.entityType] || aiApplied.entityType}</span>}
                {aiApplied.dateFrom && <span className="chip">Desde: {aiApplied.dateFrom}</span>}
                {aiApplied.dateTo && <span className="chip">Hasta: {aiApplied.dateTo}</span>}
                <span className="count-note">{total} resultado(s)</span>
              </div>
            )}
          </div>
        ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <div className="field">
            <label htmlFor="aud-from">Desde</label>
            <input id="aud-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="aud-to">Hasta</label>
            <input id="aud-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="field" style={{ minWidth: 220 }}>
            <label htmlFor="aud-user">Usuario</label>
            <select id="aud-user" value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="">Todos</option>
              {actorOptions.map((a) => (
                <option key={a.id} value={a.id}>{a.nombre}{a.email ? ` (${a.email})` : ""}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="aud-action">Acción</label>
            <select id="aud-action" value={action} onChange={(e) => setAction(e.target.value)}>
              <option value="">Todas</option>
              {Object.entries(ACTION_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="aud-entity">Entidad</label>
            <select id="aud-entity" value={entityType} onChange={(e) => setEntityType(e.target.value)}>
              <option value="">Todas</option>
              {Object.entries(ENTITY_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </div>
          <button type="button" className="btn" onClick={clearFilters} style={{ alignSelf: "flex-end" }}>Limpiar filtros</button>
          <div className="spacer" />
          <span className="count-note" style={{ alignSelf: "flex-end" }}>{total} acción(es) registrada(s)</span>
        </div>
        )}
      </div>

      {error && <div className="modal-error" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="table-card">
        <div className="table-scroll">
          {loading ? (
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="skeleton-bar" style={{ height: 18, width: `${60 + (i % 4) * 8}%` }} />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <div className="empty">No hay acciones registradas que coincidan con los filtros.</div>
          ) : (
            <table className="audit-log">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Usuario</th>
                  <th>Acción</th>
                  <th>Entidad</th>
                  <th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => <AuditRow key={log.id} log={log} />)}
              </tbody>
            </table>
          )}
        </div>
        <div className="table-footer">
          <div className="page-btns">
            <button type="button" className="btn small" disabled={page <= 1 || loading} onClick={() => goToPage(page - 1)}>Anterior</button>
            <button type="button" className="btn small" disabled={page >= totalPages || loading} onClick={() => goToPage(page + 1)}>Siguiente</button>
          </div>
          <span className="count-note">Página {page} de {totalPages}</span>
          <div className="spacer" />
          <span className="count-note">{total} registro(s)</span>
        </div>
      </div>
    </div>
  );
}
