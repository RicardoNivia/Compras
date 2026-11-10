"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { explainKpiApi } from "@/lib/api";
import { renderMarkdown } from "@/lib/markdown";
import { IconAlert, IconSpark } from "@/components/icons";

// Botón "Explícame este número": pide al Agente IA (Anthropic, sin streaming)
// una explicación puntual del KPI a partir de los registros
// que lo componen, y la muestra en un modal con el mismo renderizado
// Markdown del chat — se calcula una sola vez y se cachea mientras el
// componente esté montado con las mismas props.
// explicar (opcional): quien usa el botón pide la explicación a su manera (p. ej. Bienestar, que la calcula en el servidor).
export default function KpiExplain({ label, value, comparisonLabel, comparisonValue, records, explicar, pie = "Generado por Nova con los registros del período." }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  async function handleClick() {
    setOpen(true);
    if (text || loading) return;
    setLoading(true);
    setError("");
    try {
      const { explanation } = await (explicar ? explicar() : explainKpiApi({ label, value, comparisonLabel, comparisonValue, records }));
      setText(explanation);
    } catch (err) {
      setError(err.message || "No se pudo generar la explicación.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="kpi-explain">
      <button type="button" className="kpi-explain-btn" onClick={handleClick}>
        <IconSpark size={11} /> Explicar
      </button>
      {open && createPortal(
        <div className="modal-overlay kpi-explain-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="modal kpi-explain-modal" role="dialog" aria-modal="true" aria-label={`Explicación de ${label}`}>
            <div className="kpi-explain-head">
              <span className="kpi-explain-modal-ic"><IconSpark size={18} /></span>
              <div className="kpi-explain-head-txt">
                <small>Explícame este número</small>
                <h3>{label}</h3>
              </div>
              <button type="button" className="btn-ghost icon-btn" onClick={() => setOpen(false)} aria-label="Cerrar">✕</button>
            </div>
            <div className="kpi-explain-cifras">
              <span className="kpi-explain-valor">{value}</span>
              {comparisonLabel && comparisonValue != null && (
                <span className="kpi-explain-comp">{comparisonLabel}: <b>{comparisonValue}</b></span>
              )}
            </div>
            <div className="kpi-explain-body">
              {loading && (
                <div className="kpi-explain-loading" role="status">
                  <span className="spinner" /> Nova está analizando los datos…
                </div>
              )}
              {!loading && error && <div className="modal-error"><IconAlert size={13} /> {error}</div>}
              {!loading && !error && <div className="chat-markdown">{renderMarkdown(text)}</div>}
            </div>
            <div className="kpi-explain-foot">
              <span>{pie}</span>
              <button type="button" className="btn" onClick={() => setOpen(false)}>Cerrar</button>
            </div>
          </div>
        </div>,
        // Dentro de .app-shell para que tome el color del módulo.
        document.querySelector(".app-shell") || document.body
      )}
    </div>
  );
}
