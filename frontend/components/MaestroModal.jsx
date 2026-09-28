"use client";

import { useState } from "react";
import { TIPO_LABELS } from "@/lib/maestrosTipos";
import { createMaestroApi, updateMaestroApi } from "@/lib/api";

export default function MaestroModal({ tipo, maestro, onClose, onSaved }) {
  const isEdit = !!maestro;
  const isArea = tipo === "area";
  // Si el valor ya está en uso en registros, no se puede renombrar (rompería
  // la referencia por texto), pero sí se pueden editar el resto de sus datos
  // (presupuesto, estado activo/inactivo).
  const valorLocked = isEdit && maestro.enUso;
  const [valor, setValor] = useState(maestro?.valor || "");
  const [activo, setActivo] = useState(maestro ? maestro.activo : true);
  const [presupuestoAnual, setPresupuestoAnual] = useState(
    maestro?.presupuestoAnual != null ? String(maestro.presupuestoAnual) : ""
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!valor.trim()) {
      setError("El valor es obligatorio.");
      return;
    }
    if (isArea && presupuestoAnual !== "" && (Number.isNaN(Number(presupuestoAnual)) || Number(presupuestoAnual) < 0)) {
      setError("El presupuesto anual debe ser un número válido mayor o igual a 0.");
      return;
    }

    setSaving(true);
    try {
      const payload = { valor, activo };
      if (isArea) payload.presupuestoAnual = presupuestoAnual === "" ? null : Number(presupuestoAnual);

      let saved;
      if (isEdit) {
        saved = await updateMaestroApi(maestro.id, payload);
      } else {
        saved = await createMaestroApi({ tipo, ...payload });
      }
      onSaved(saved, isEdit);
    } catch (err) {
      setError(err.message || "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 420 }}>
        <div className="modal-head">
          <h3>{isEdit ? "Editar maestro" : "Agregar maestro"}</h3>
          <button type="button" className="btn-ghost icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ gridTemplateColumns: "1fr" }}>
            <div className="field">
              <label>Tipo</label>
              <div className="dvalue">{TIPO_LABELS[tipo]}</div>
            </div>
            <div className="field">
              <label htmlFor="m-valor">Valor *</label>
              {valorLocked ? (
                <>
                  <div className="dvalue">{valor}</div>
                  <span className="card-sub" style={{ margin: 0 }}>
                    En uso en registros existentes: no se puede renombrar.
                  </span>
                </>
              ) : (
                <input
                  id="m-valor" autoFocus required
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                />
              )}
            </div>
            {isArea && (
              <div className="field">
                <label htmlFor="m-presupuesto">Presupuesto anual</label>
                <input
                  id="m-presupuesto" type="number" min="0" step="1000"
                  value={presupuestoAnual}
                  onChange={(e) => setPresupuestoAnual(e.target.value)}
                  placeholder="Ej. 50000000"
                />
              </div>
            )}
            <div className="field">
              <label htmlFor="m-activo">Estado</label>
              <select id="m-activo" value={activo ? "1" : "0"} onChange={(e) => setActivo(e.target.value === "1")}>
                <option value="1">Activo</option>
                <option value="0">Inactivo</option>
              </select>
            </div>

            {error && <div className="modal-error">{error}</div>}
          </div>

          <div className="modal-foot">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving && <span className="spinner" />}
              {saving ? "Guardando…" : "Guardar"}
            </button>
            <button type="button" className="btn" onClick={onClose} disabled={saving}>Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  );
}
