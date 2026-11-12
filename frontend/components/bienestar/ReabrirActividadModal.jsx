"use client";

import { useState } from "react";
import { reabrirActividadApi } from "@/lib/api";

// Reabrir una actividad cerrada: vuelve a «ejecutada» para modificar cualquier cosa (o eliminarla). Pide el motivo, que
// queda en Auditoría junto con quién la reabrió y quién la había cerrado.
export default function ReabrirActividadModal({ act, onClose, onReabierta }) {
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function reabrir() {
    if (motivo.trim().length < 5) return setError("Escribe por qué se reabre (al menos unas palabras).");
    setSaving(true);
    setError("");
    try {
      await reabrirActividadApi(act.id, motivo.trim());
      onReabierta();
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  }
  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="re-act-t" style={{ maxWidth: 560 }}>
        <div className="modal-head">
          <h3 id="re-act-t">Reabrir “{act.nombre}”</h3>
          <button type="button" className="btn-ghost icon-btn" onClick={onClose} disabled={saving} aria-label="Cerrar">✕</button>
        </div>
        <div className="modal-body" style={{ display: "block" }}>
          <div className="cerrar-aviso" role="note">
            <strong>La actividad vuelve a «Ejecutada».</strong>
            <p>Podrás modificar sus datos, participantes, inventario, fotos y compras, o eliminarla. Su calificación de cierre se conserva y al cerrarla de nuevo se vuelve a pedir. Queda en Auditoría quién la reabrió y por qué.</p>
          </div>
          <div className="field">
            <label htmlFor="re-act-motivo">¿Por qué se reabre? *</label>
            <textarea id="re-act-motivo" rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: faltó cargar la asistencia, hay que asociar una compra, se cerró por error…" autoFocus />
          </div>
          {error && <div className="modal-error" style={{ marginTop: 8 }}>{error}</div>}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn btn-primary" onClick={reabrir} disabled={saving}>{saving && <span className="spinner" />} Sí, reabrir actividad</button>
          <button type="button" className="btn" onClick={onClose} disabled={saving}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}
