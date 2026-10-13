"use client";

import { useEffect, useState } from "react";
import { reviewProveedoresApi } from "@/lib/api";
import { IconSpark, IconAlert, IconBell } from "@/components/icons";

const NIVEL = { critica: { label: "Crítica", cls: "critical" }, advertencia: { label: "Advertencia", cls: "warning" }, informativa: { label: "Informativa", cls: "accent" } };

// "Explicar con Nova" de proveedores: análisis con alertas, notificaciones y sugerencias (mismo
// patrón no streaming de "Revisar con Nova" en Alertas). Por defecto analiza el ciclo (Indicadores);
// el Informe mensual pasa su propio "analizar" y un "clave" (el mes) para no reutilizar el análisis
// de otro mes.
export default function ExplicarProveedoresIA({
  analizar = reviewProveedoresApi,
  clave = "ciclo",
  titulo = "Análisis del ciclo de proveedores",
  subtitulo = "Resumen, alertas y notificaciones según los datos actuales",
  cargando = "Analizando el ciclo…",
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  // Si cambia lo que se analiza (otro mes), el análisis anterior ya no aplica.
  useEffect(() => {
    setResult(null);
    setError("");
  }, [clave]);

  async function generar() {
    setOpen(true);
    setLoading(true);
    setError("");
    try {
      setResult(await analizar());
    } catch (err) {
      setError(err.message || "No se pudo generar el análisis.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button type="button" className="btn btn-sync" onClick={result ? () => setOpen(true) : generar} disabled={loading}>
        {loading ? <span className="spinner" /> : <IconSpark size={14} />} {loading ? "Analizando…" : "Explicar con Nova"}
      </button>
      {open && (
        <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="modal kpi-explain-modal" style={{ maxWidth: 640 }}>
            <div className="modal-head">
              <div className="kpi-explain-modal-title">
                <span className="kpi-explain-modal-ic"><IconSpark size={16} /></span>
                <div>
                  <h3>{titulo}</h3>
                  <p className="card-sub" style={{ margin: 0 }}>{subtitulo}</p>
                </div>
              </div>
              <button type="button" className="btn-ghost icon-btn" onClick={() => setOpen(false)} aria-label="Cerrar">✕</button>
            </div>
            <div className="modal-body" style={{ display: "block" }}>
              {loading && <div className="kpi-explain-loading"><span className="spinner" /> {cargando}</div>}
              {!loading && error && <div className="modal-error"><IconAlert size={13} /> {error}</div>}
              {!loading && !error && result && (
                <div className="prov-ia">
                  <h4>Resumen</h4>
                  <p>{result.resumen}</p>
                  {result.alertas?.length > 0 && (
                    <>
                      <h4><IconAlert size={13} /> Alertas</h4>
                      <ul className="prov-ia-list">
                        {result.alertas.map((a, i) => {
                          const n = NIVEL[String(a.nivel).toLowerCase()] || NIVEL.informativa;
                          return <li key={i}><span className={`pill ${n.cls}`}>{n.label}</span><span>{a.texto}</span></li>;
                        })}
                      </ul>
                    </>
                  )}
                  {result.notificaciones?.length > 0 && (
                    <>
                      <h4><IconBell size={13} /> Notificaciones</h4>
                      <ul className="prov-ia-notes">
                        {result.notificaciones.map((t, i) => <li key={i}>{t}</li>)}
                      </ul>
                    </>
                  )}
                  {result.sugerencias?.length > 0 && (
                    <>
                      <h4>Sugerencias</h4>
                      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.6 }}>
                        {result.sugerencias.map((s, i) => <li key={i}>{s}</li>)}
                      </ul>
                    </>
                  )}
                </div>
              )}
            </div>
            <div className="modal-foot">
              <button type="button" className="btn" onClick={generar} disabled={loading}>Volver a analizar</button>
              <div className="spacer" />
              <button type="button" className="btn" onClick={() => setOpen(false)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
