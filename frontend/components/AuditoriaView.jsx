"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fmtPesos } from "@/lib/format";
import { ACTION_LABELS } from "@/lib/auditLabels";

const ACTION_PILL = {
  crear: "good",
  editar: "warning",
  eliminar: "critical",
  radicar: "secondary",
};

const MONEY_FIELDS = new Set(["valorConIva", "valorSinIva", "valorCot"]);

function fmtValue(field, v) {
  if (v === null || v === undefined || v === "") return "—";
  if (field === "radicado") return v === true || v === "true" ? "Sí" : "No";
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
      <td className="truncate wide" title={log.recordInfo || ""}>{log.recordInfo || "—"}</td>
      <td style={{ maxWidth: 480 }}>
        {hasChanges ? (
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
        ) : (
          <span className="count-note">—</span>
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const fetchLogs = useCallback(async (opts) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (opts.from) params.set("from", opts.from);
      if (opts.to) params.set("to", opts.to);
      if (opts.userId) params.set("userId", opts.userId);
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
    fetchLogs({ from, to, userId, page: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, userId]);

  function goToPage(p) {
    if (p < 1 || p > totalPages) return;
    fetchLogs({ from, to, userId, page: p });
  }

  function clearFilters() {
    setFrom("");
    setTo("");
    setUserId("");
  }

  const actorOptions = useMemo(
    () => (actors || []).filter((a) => a.id).sort((a, b) => (a.nombre || "").localeCompare(b.nombre || "")),
    [actors]
  );

  return (
    <div>
      <div className="toolbar" id="auditoria-toolbar">
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
        <button type="button" className="btn" onClick={clearFilters}>Limpiar filtros</button>
        <div className="spacer" />
        <span className="count-note">{total} acción(es) registrada(s)</span>
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
                  <th>Registro</th>
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
