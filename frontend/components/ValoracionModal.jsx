"use client";

import { useEffect, useRef, useState } from "react";
import { getValoracionApi, generarValoracionApi } from "@/lib/api";
import ValoracionPuntaje from "@/components/ValoracionPuntaje";
import { IconSpark, IconAlert } from "@/components/icons";

const IMPACTO = { positivo: { cls: "good", label: "A favor" }, neutro: { cls: "muted", label: "Neutro" }, negativo: { cls: "critical", label: "En contra" } };

// Valoración de Nova de una compra radicada. Con auto=true (al radicar) la genera apenas abre; si no,
// muestra la que ya existe y permite volver a generarla. Analiza todo el registro y las compras
// anteriores con el mismo proveedor, y explica por qué califica así la compra y al proveedor.
export default function ValoracionModal({ record, auto = false, canGenerate = true, onClose, onSaved }) {
  const [valoracion, setValoracion] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const iniciado = useRef(false);

  async function generar() {
    setGenerating(true);
    setError("");
    try {
      const v = await generarValoracionApi(record.id);
      setValoracion(v);
      onSaved?.(record.id, v);
    } catch (err) {
      setError(err.message || "No se pudo generar la valoración.");
    } finally {
      setGenerating(false);
      setLoading(false);
    }
  }

  useEffect(() => {
    if (iniciado.current) return;
    iniciado.current = true;
    if (auto) {
      generar();
      return;
    }
    getValoracionApi(record.id)
      .then((v) => {
        setValoracion(v);
        if (!v && canGenerate) generar();
      })
      .catch((err) => setError(err.message || "No se pudo cargar la valoración."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const trabajando = loading || generating;

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !generating) onClose(); }}>
      <div className="modal kpi-explain-modal valoracion-modal" role="dialog" aria-modal="true" aria-label="Valoración de Nova" style={{ maxWidth: 680 }}>
        <div className="modal-head">
          <div className="kpi-explain-modal-title">
            <span className="kpi-explain-modal-ic"><IconSpark size={16} /></span>
            <div>
              <h3>Valoración de Nova</h3>
              <p className="card-sub" style={{ margin: 0 }}>
                Compra {record.localSeq ? `#${record.localSeq}` : ""}{record.proveedor ? ` · ${record.proveedor}` : ""}
              </p>
            </div>
          </div>
          <button type="button" className="btn-ghost icon-btn" onClick={onClose} disabled={generating} aria-label="Cerrar">✕</button>
        </div>

        <div className="modal-body" style={{ display: "block", maxHeight: "68vh" }}>
          {trabajando && (
            <div className="kpi-explain-loading">
              <span className="spinner" /> Analizando la compra, sus tiempos y las compras anteriores con este proveedor…
            </div>
          )}
          {!trabajando && error && <div className="modal-error"><IconAlert size={13} /> {error}</div>}
          {!trabajando && !error && !valoracion && <div className="empty">Esta compra todavía no tiene valoración.</div>}

          {!trabajando && valoracion && (
            <div className="valoracion">
              <div className="valoracion-puntajes">
                <div>
                  <span className="valoracion-label">La compra</span>
                  <ValoracionPuntaje puntaje={valoracion.puntajeCompra} />
                </div>
                <div>
                  <span className="valoracion-label">El proveedor</span>
                  {valoracion.puntajeProveedor != null ? <ValoracionPuntaje puntaje={valoracion.puntajeProveedor} /> : <span className="muted">Sin proveedor</span>}
                </div>
                <div>
                  <span className="valoracion-label">Compras anteriores analizadas</span>
                  <strong>{valoracion.comprasPrevias}</strong>
                </div>
              </div>

              <p className="valoracion-resumen">{valoracion.resumen}</p>

              <h4>Por qué calificó así la compra</h4>
              <p>{valoracion.observacionCompra}</p>

              {valoracion.observacionProveedor && (
                <>
                  <h4>Por qué calificó así al proveedor</h4>
                  <p>{valoracion.observacionProveedor}</p>
                </>
              )}

              {valoracion.factores?.length > 0 && (
                <>
                  <h4>Factores considerados</h4>
                  <ul className="valoracion-factores">
                    {valoracion.factores.map((f, i) => {
                      const imp = IMPACTO[f.impacto] || IMPACTO.neutro;
                      return (
                        <li key={i}>
                          <span className={`pill ${imp.cls}`}>{imp.label}</span>
                          <span><strong>{f.factor}.</strong> {f.detalle}</span>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}

              <p className="count-note valoracion-pie">
                Generada {new Date(valoracion.updatedAt).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })}
                {valoracion.creadoPorNombre ? ` por ${valoracion.creadoPorNombre}` : ""}
                {valoracion.origen === "carga masiva" ? " (carga masiva de registros existentes)" : ""}.
              </p>
            </div>
          )}
        </div>

        <div className="modal-foot">
          {canGenerate && !trabajando && (valoracion || error) && (
            <button type="button" className="btn" onClick={generar}>{valoracion ? "Volver a valorar" : "Reintentar"}</button>
          )}
          <div className="spacer" />
          <button type="button" className="btn btn-primary" onClick={onClose} disabled={generating}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
