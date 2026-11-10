"use client";

import { useState } from "react";
import { cambiarClasificacionApi } from "@/lib/api";

// Marca como excepción o inactiva a un proveedor. No borra nada: el histórico
// de ciclos se conserva y la acción queda en Auditoría.
export default function ProveedorAccionesModal({ proveedor, accion, motivos = [], onClose, onDone }) {
  const esExcepcion = accion === "excepcion";
  const [motivoId, setMotivoId] = useState(motivos[0]?.id || "");
  const [justificacion, setJustificacion] = useState("");
  const [inactivoMotivo, setInactivoMotivo] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const body = esExcepcion
        ? { accion, motivoExcepcionId: motivoId, justificacion }
        : { accion, inactivoMotivo };
      const detalle = await cambiarClasificacionApi(proveedor.nit, body);
      onDone(detalle);
    } catch (err) {
      setError(err.message || "No se pudo guardar el cambio.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 460 }}>
        <div className="modal-head">
          <h3>{esExcepcion ? "Marcar como excepción" : "Inactivar proveedor"}</h3>
          <button type="button" className="btn-ghost icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ gridTemplateColumns: "1fr" }}>
            <p className="muted" style={{ margin: 0 }}>{proveedor.nombre}</p>
            {esExcepcion ? (
              <>
                <div className="field">
                  <label htmlFor="acc-motivo">Motivo *</label>
                  <select id="acc-motivo" required value={motivoId} onChange={(e) => setMotivoId(e.target.value)}>
                    {motivos.length === 0 && <option value="">No hay motivos en Maestros</option>}
                    {motivos.map((m) => <option key={m.id} value={m.id}>{m.valor}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="acc-justificacion">Justificación</label>
                  <textarea id="acc-justificacion" rows={3} value={justificacion} onChange={(e) => setJustificacion(e.target.value)} />
                </div>
                <div className="prov-note">La excepción sale del ciclo de actualización y del checklist. Compras no verá alerta.</div>
              </>
            ) : (
              <>
                <div className="field">
                  <label htmlFor="acc-inactivo">Motivo *</label>
                  <input id="acc-inactivo" required value={inactivoMotivo} onChange={(e) => setInactivoMotivo(e.target.value)} placeholder="Ej.: desvinculado, no apto, anulado" />
                </div>
                <div className="prov-note">El proveedor no aparece al registrar compras. Conserva su histórico y se puede reactivar.</div>
              </>
            )}
            {error && <div className="modal-error">{error}</div>}
          </div>
          <div className="modal-foot">
            <div className="spacer" />
            <button type="button" className="btn" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving || (esExcepcion && !motivoId)}>
              {saving ? <span className="spinner" /> : null} {esExcepcion ? "Marcar excepción" : "Inactivar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
