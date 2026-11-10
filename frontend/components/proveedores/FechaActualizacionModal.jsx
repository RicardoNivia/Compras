"use client";

import { useState } from "react";
import { diaISO, fmtFecha } from "@/lib/proveedoresOpciones";

// Al aprobar (pasar a "Actualizado") se pide la fecha en que el proveedor se actualizó: queda como
// su fecha de última actualización, base del ciclo. Debe ser del ciclo vigente y no futura.
export default function FechaActualizacionModal({ titulo, inicioCiclo, onCancel, onConfirm }) {
  const hoy = diaISO();
  const min = inicioCiclo ? diaISO(inicioCiclo) : undefined;
  const [fecha, setFecha] = useState(hoy);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  async function confirmar(e) {
    e.preventDefault();
    if (!fecha) { setError("Indica la fecha de actualización."); return; }
    if (fecha > hoy) { setError("La fecha no puede ser futura."); return; }
    if (min && fecha < min) { setError(`La fecha debe ser del ciclo vigente (desde el ${fmtFecha(inicioCiclo)}).`); return; }
    setError("");
    setGuardando(true);
    try {
      await onConfirm(fecha);
    } catch (err) {
      setError(err.message || "No se pudo aprobar.");
      setGuardando(false);
    }
  }

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !guardando) onCancel(); }}>
      <form className="modal" role="dialog" aria-modal="true" aria-labelledby="prov-fecha-act-t" style={{ maxWidth: 440 }} onSubmit={confirmar}>
        <div className="modal-head">
          <h3 id="prov-fecha-act-t">Aprobar actualización</h3>
          <button type="button" className="btn-ghost icon-btn" onClick={onCancel} disabled={guardando} aria-label="Cerrar">✕</button>
        </div>
        <div className="modal-body" style={{ display: "block" }}>
          <p style={{ marginTop: 0 }}>{titulo}</p>
          <div className="field">
            <label htmlFor="prov-fecha-act">Fecha de actualización *</label>
            <input id="prov-fecha-act" type="date" value={fecha} min={min} max={hoy} required autoFocus onChange={(e) => setFecha(e.target.value)} />
          </div>
          <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>
            Queda como fecha de última actualización del proveedor (base del ciclo) y se registra en Auditoría.
          </p>
          {error && <div className="modal-error" role="alert">{error}</div>}
        </div>
        <div className="modal-foot">
          <div className="spacer" />
          <button type="button" className="btn" onClick={onCancel} disabled={guardando}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={guardando}>
            {guardando ? <span className="spinner" /> : null} Aprobar
          </button>
        </div>
      </form>
    </div>
  );
}
