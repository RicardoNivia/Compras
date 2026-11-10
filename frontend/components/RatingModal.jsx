"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchMaestros, fetchCalificacionApi, saveCalificacionApi } from "@/lib/api";
import { IconStar } from "@/components/icons";

// Calificación del proveedor estilo Uber/Rappi: 1 a 5 estrellas: si es menor
// a 5, exige elegir al menos una causa (maestro tipo="causaCalificacion",
// filtrado por Maestro.aplicaEstrellas === estrellas elegidas — ver
// backend/lib/calificaciones.js). Una sola calificación por registro, se
// puede volver a abrir y editar en cualquier momento (upsert).
export default function RatingModal({ record, onClose, onSaved }) {
  const [loading, setLoading] = useState(true);
  const [estrellas, setEstrellas] = useState(0);
  const [hoverEstrellas, setHoverEstrellas] = useState(0);
  const [causas, setCausas] = useState([]);
  const [causasIds, setCausasIds] = useState([]);
  const [comentario, setComentario] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchMaestros("causaCalificacion", true),
      fetchCalificacionApi(record.id),
    ])
      .then(([maestrosData, calificacionData]) => {
        if (cancelled) return;
        setCausas(maestrosData.maestros || []);
        const actual = calificacionData.calificacion;
        if (actual) {
          setEstrellas(actual.estrellas);
          setCausasIds(actual.causasIds || []);
          setComentario(actual.comentario || "");
        }
      })
      .catch((err) => { if (!cancelled) setError(err.message || "No se pudo cargar la calificación."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [record.id]);

  const causasAplicables = useMemo(
    () => causas.filter((c) => c.aplicaEstrellas === estrellas),
    [causas, estrellas]
  );

  function selectEstrellas(n) {
    setEstrellas(n);
    setCausasIds([]);
  }

  function toggleCausa(id) {
    setCausasIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!estrellas) {
      setError("Selecciona una cantidad de estrellas.");
      return;
    }
    if (estrellas < 5 && !causasIds.length) {
      setError("Selecciona al menos una causa de la calificación.");
      return;
    }
    setSaving(true);
    try {
      const { calificacion } = await saveCalificacionApi(record.id, { estrellas, causasIds, comentario });
      onSaved(record.id, calificacion);
    } catch (err) {
      setError(err.message || "No se pudo guardar la calificación.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 460 }}>
        <div className="modal-head">
          <h3>Calificar proveedor</h3>
          <button type="button" className="btn-ghost icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        {loading ? (
          <div className="modal-body" style={{ gridTemplateColumns: "1fr" }}>
            <div className="dvalue">Cargando…</div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="modal-body" style={{ gridTemplateColumns: "1fr" }}>
              <div className="field">
                <label>Proveedor</label>
                <div className="dvalue">{record.proveedor || "—"}{record.localSeq ? ` · #${record.localSeq}` : ""}</div>
              </div>

              <div className="field">
                <label>¿Cómo calificas esta compra? *</label>
                <div className="rating-stars" role="radiogroup" aria-label="Estrellas">
                  {[1, 2, 3, 4, 5].map((n) => {
                    const filled = (hoverEstrellas || estrellas) >= n;
                    return (
                      <button
                        key={n}
                        type="button"
                        className={`rating-star-btn${filled ? " filled" : ""}`}
                        role="radio"
                        aria-checked={estrellas === n}
                        onClick={() => selectEstrellas(n)}
                        onMouseEnter={() => setHoverEstrellas(n)}
                        onMouseLeave={() => setHoverEstrellas(0)}
                        title={`${n} estrella${n === 1 ? "" : "s"}`}
                      >
                        <IconStar size={24} filled={filled} />
                      </button>
                    );
                  })}
                </div>
              </div>

              {estrellas > 0 && estrellas < 5 && (
                <div className="field">
                  <label>¿Qué pasó? (selecciona todas las que apliquen) *</label>
                  {causasAplicables.length === 0 ? (
                    <span className="card-sub" style={{ margin: 0 }}>
                      No hay causas configuradas para {estrellas} estrella(s). Pide a un administrador que las agregue en Maestros → Causa de calificación.
                    </span>
                  ) : (
                    <div className="rating-causas-list">
                      {causasAplicables.map((c) => (
                        <label key={c.id} className="rating-causa-item">
                          <input
                            type="checkbox"
                            checked={causasIds.includes(c.id)}
                            onChange={() => toggleCausa(c.id)}
                          />
                          <span>{c.valor}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="field">
                <label htmlFor="rating-comentario">Comentario (opcional)</label>
                <textarea
                  id="rating-comentario" rows={3}
                  value={comentario}
                  onChange={(e) => setComentario(e.target.value)}
                  maxLength={2000}
                />
              </div>

              {error && <div className="modal-error">{error}</div>}
            </div>

            <div className="modal-foot">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving && <span className="spinner" />}
                {saving ? "Guardando…" : "Guardar calificación"}
              </button>
              <button type="button" className="btn" onClick={onClose} disabled={saving}>Cancelar</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
