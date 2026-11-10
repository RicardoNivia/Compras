"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { fetchRecordTimelineApi } from "@/lib/api";
import { IconHistory, IconFlag, IconCheck, IconEdit, IconTrash, IconAlert } from "@/components/icons";

const KIND_ICON = {
  creado: IconHistory,
  estado: IconFlag,
  legalizacion: IconCheck,
  radicado: IconCheck,
  editado: IconEdit,
  eliminado: IconTrash,
};

function formatWhen(iso) {
  try {
    return new Date(iso).toLocaleString("es-CO", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

// Botón de icono que abre el modal — se usa tal cual en RegistrosView.jsx y
// AlertasView.jsx, así ambos lugares disparan exactamente la misma línea de
// tiempo para un registro sin duplicar el modal en cada vista.
export function TimelineButton({ recordId, localSeq, variant = "icon" }) {
  const [open, setOpen] = useState(false);
  if (!recordId) return null;
  return (
    <>
      {variant === "icon" ? (
        <button type="button" className="icon-action-btn history" onClick={() => setOpen(true)} title="Línea de tiempo del registro">
          <IconHistory size={13} />
        </button>
      ) : (
        <button type="button" className="btn small" onClick={() => setOpen(true)} title="Línea de tiempo del registro">
          <IconHistory size={11} /> Historial
        </button>
      )}
      {open && <RecordTimelineModal recordId={recordId} localSeq={localSeq} onClose={() => setOpen(false)} />}
    </>
  );
}

// Línea de tiempo de ALTO NIVEL (creación, cambios de estado/legalización/
// radicado, ediciones genéricas) — a propósito sin el detalle campo por campo
// de la sección Auditoría completa (ver backend/app/api/records/[id]/timeline/route.js),
// para que cualquier rol pueda entender rápido qué pasó con una compra.
export default function RecordTimelineModal({ recordId, localSeq, onClose }) {
  const [events, setEvents] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchRecordTimelineApi(recordId)
      .then((data) => { if (!cancelled) setEvents(data.events || []); })
      .catch((err) => { if (!cancelled) setError(err.message || "No se pudo cargar la línea de tiempo."); });
    return () => { cancelled = true; };
  }, [recordId]);

  // Portal a document.body: si este modal se abre desde un botón DENTRO de
  // una celda "position:sticky" (la columna Acciones de la tabla, ver
  // RegistrosView.jsx/AlertasView.jsx), renderizarlo inline quedaría
  // atrapado dentro del contexto de apilamiento de esa celda — su z-index
  // dejaría de competer contra el resto de la página y las demás celdas
  // sticky de otras filas se verían flotando por encima del fondo oscuro
  // del modal. Sacarlo del DOM de la tabla evita el problema de raíz.
  return createPortal(
    <div className="modal-overlay timeline-modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal timeline-modal">
        <div className="modal-head">
          <div className="kpi-explain-modal-title">
            <span className="kpi-explain-modal-ic"><IconHistory size={16} /></span>
            <div>
              <h3>Línea de tiempo{localSeq ? ` — #${localSeq}` : ""}</h3>
              <p className="card-sub" style={{ margin: 0 }}>Qué ha pasado con este registro, de más antiguo a más reciente</p>
            </div>
          </div>
          <button type="button" className="btn-ghost icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div className="modal-body timeline-modal-body">
          {!events && !error && (
            <div className="kpi-explain-loading"><span className="spinner" /> Cargando…</div>
          )}
          {error && <div className="modal-error"><IconAlert size={13} /> {error}</div>}
          {events && events.length === 0 && <div className="empty">Sin movimientos registrados todavía.</div>}
          {events && events.length > 0 && (
            <div className="timeline">
              {events.map((ev, i) => {
                const Icon = KIND_ICON[ev.kind] || IconEdit;
                const isLast = i === events.length - 1;
                return (
                  <div key={ev.id} className="timeline-item" style={{ animationDelay: `${i * 0.06}s` }}>
                    <div className="timeline-rail">
                      <span className={`timeline-dot kind-${ev.kind}${isLast ? " is-current" : ""}`}><Icon size={12} /></span>
                      {!isLast && <span className="timeline-line" />}
                    </div>
                    <div className="timeline-content">
                      <div className="timeline-label">{ev.label}</div>
                      <div className="timeline-meta">{formatWhen(ev.createdAt)}{ev.actor ? ` · ${ev.actor}` : ""}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
