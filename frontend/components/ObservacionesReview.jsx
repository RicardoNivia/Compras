"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { reviewObservacionesApi } from "@/lib/api";
import { IconSpark, IconAlert, IconCheck, IconInfo, IconCopy } from "@/components/icons";

const INFO_TEXT = "La IA revisa si el texto de Observaciones justifica bien el estado de legalización actual (qué falta, si es muy vago, etc.) y, si no alcanza, te propone un texto mejorado para que lo copies tú mismo — no cambia nada en el registro automáticamente.";

// "Revisar con Nova" junto al campo Observaciones — evalúa si el texto
// justifica bien el estado de legalización actual y, si no, propone una
// versión mejorada en texto plano, puramente informativa: este componente
// NUNCA modifica el registro ni el formulario por sí mismo — solo muestra la
// sugerencia para que el usuario la copie a mano si quiere (ver
// backend/app/api/agent/review-observaciones). Mismo patrón de modal/estado
// que KpiExplain (DashboardView.jsx), pero sin caché entre aperturas porque
// el texto de observaciones puede cambiar entre una revisión y otra.
export default function ObservacionesReview({ observaciones, estadoLegalizacion, descripcion, area, categoria, proveedor, valorConIva, onLoadingChange }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [showInfo, setShowInfo] = useState(false);
  const [infoPos, setInfoPos] = useState(null);
  const infoBtnRef = useRef(null);
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(result.sugerencia);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // portapapeles no disponible (permiso denegado, navegador viejo, etc.)
      // — no es crítico, el texto sigue visible para copiarlo a mano.
    }
  }

  function openInfo() {
    const rect = infoBtnRef.current?.getBoundingClientRect();
    if (rect) setInfoPos({ top: rect.bottom + 6, left: rect.left });
    setShowInfo(true);
  }

  async function handleClick() {
    setOpen(true);
    setLoading(true);
    onLoadingChange?.(true);
    setError("");
    setResult(null);
    setCopied(false);
    try {
      const res = await reviewObservacionesApi({ observaciones, estadoLegalizacion, descripcion, area, categoria, proveedor, valorConIva });
      setResult(res);
    } catch (err) {
      setError(err.message || "No se pudo revisar la observación.");
    } finally {
      setLoading(false);
      onLoadingChange?.(false);
    }
  }

  return (
    <div className="kpi-explain">
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <button type="button" className="kpi-explain-btn" onClick={handleClick} disabled={loading || !observaciones || !observaciones.trim()}>
          {loading ? <span className="spinner" /> : <IconSpark size={11} />} {loading ? "Revisando…" : "Revisar con Nova"}
        </button>
        <button
          ref={infoBtnRef}
          type="button" className="btn-ghost icon-btn" aria-label="¿Qué hace Revisar con Nova?"
          style={{ width: 18, height: 18, padding: 0, opacity: 0.6 }}
          onClick={() => (showInfo ? setShowInfo(false) : openInfo())}
          onMouseEnter={openInfo}
          onMouseLeave={() => setShowInfo(false)}
        >
          <IconInfo size={13} />
        </button>
      </div>
      {showInfo && infoPos && typeof document !== "undefined" && createPortal(
        // Portal a document.body + position:fixed: el modal padre tiene
        // scroll/overflow propio y un tooltip anidado ahí quedaba cortado o
        // tapado por el pie del modal — así siempre flota completo por
        // encima de todo, sin importar el scroll del contenedor.
        <div
          role="tooltip"
          style={{
            position: "fixed", top: infoPos.top, left: infoPos.left, zIndex: 300, maxWidth: 320,
            background: "var(--ink)", color: "var(--page)",
            fontSize: 12, lineHeight: 1.45, padding: "8px 10px", borderRadius: 8,
            boxShadow: "0 8px 20px rgba(24,39,75,0.3)",
          }}
        >
          {INFO_TEXT}
        </div>,
        document.body
      )}
      {open && (
        <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="modal kpi-explain-modal">
            <div className="modal-head">
              <div className="kpi-explain-modal-title">
                <span className="kpi-explain-modal-ic"><IconSpark size={16} /></span>
                <div>
                  <h3>Revisión de observaciones</h3>
                  <p className="card-sub" style={{ margin: 0 }}>Estado de legalización: {estadoLegalizacion || "(sin definir)"}</p>
                </div>
              </div>
              <button type="button" className="btn-ghost icon-btn" onClick={() => setOpen(false)} aria-label="Cerrar">✕</button>
            </div>
            <div className="modal-body">
              {loading && (
                <div className="kpi-explain-loading"><span className="spinner" /> Revisando la observación…</div>
              )}
              {!loading && error && <div className="modal-error"><IconAlert size={13} /> {error}</div>}
              {!loading && !error && result && (
                <>
                  <div className={`pill ${result.suficiente ? "good" : "warning"}`} style={{ marginBottom: 10 }}>
                    {result.suficiente ? <IconCheck size={12} /> : <IconAlert size={12} />}{" "}
                    {result.suficiente ? "Justificación suficiente" : "Podría mejorarse"}
                  </div>
                  <p style={{ margin: "0 0 10px", fontSize: 13.5, lineHeight: 1.5 }}>{result.comentario}</p>
                  {result.sugerencia && (
                    <div className="field full" style={{ marginTop: 4 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <label style={{ margin: 0 }}>Sugerencia (solo informativa — no se aplica sola)</label>
                        <button type="button" className="btn small" onClick={handleCopy}>
                          {copied ? <IconCheck size={12} /> : <IconCopy size={12} />} {copied ? "Copiado" : "Copiar"}
                        </button>
                      </div>
                      <div className="dvalue" style={{ background: "var(--surface-2)", borderRadius: 10, padding: "8px 10px", whiteSpace: "pre-wrap" }}>
                        {result.sugerencia}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="modal-foot">
              <button type="button" className="btn" onClick={() => setOpen(false)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
