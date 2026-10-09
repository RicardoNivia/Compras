"use client";

import { useState } from "react";
import { createProveedorApi, updateProveedorApi } from "@/lib/api";

export default function ProveedorModal({ proveedor, onClose, onSaved }) {
  const isEdit = !!proveedor;
  const [nit, setNit] = useState(proveedor?.nit || "");
  const [nombre, setNombre] = useState(proveedor?.nombre || "");
  const [descripcion, setDescripcion] = useState(proveedor?.descripcion || "");
  const [telefono, setTelefono] = useState(proveedor?.telefono || "");
  const [correo, setCorreo] = useState(proveedor?.correo || "");
  const [documentacionAlDia, setDocumentacionAlDia] = useState(proveedor?.documentacionAlDia ?? false);
  const [activo, setActivo] = useState(proveedor ? proveedor.activo : true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!nit.trim()) {
      setError("El nit es obligatorio.");
      return;
    }
    if (!nombre.trim()) {
      setError("El nombre es obligatorio.");
      return;
    }
    if (!descripcion.trim()) {
      setError("La descripción es obligatoria.");
      return;
    }

    setSaving(true);
    try {
      const payload = { nit, nombre, descripcion, telefono, correo, documentacionAlDia, activo };
      let saved;
      if (isEdit) {
        saved = await updateProveedorApi(proveedor.id, payload);
      } else {
        saved = await createProveedorApi(payload);
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
          <h3>{isEdit ? "Editar proveedor" : "Agregar proveedor"}</h3>
          <button type="button" className="btn-ghost icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ gridTemplateColumns: "1fr" }}>
            <div className="field">
              <label htmlFor="p-nit">Nit *</label>
              <input
                id="p-nit" autoFocus required
                value={nit}
                onChange={(e) => setNit(e.target.value)}
                placeholder="Sin dígito de verificación"
                spellCheck={false}
              />
              {isEdit && (
                <span className="card-sub" style={{ margin: 0 }}>
                  Puedes corregir el nit o el nombre aunque esté en uso — la referencia real en los registros es interna y nunca cambia.
                </span>
              )}
            </div>
            <div className="field">
              <label htmlFor="p-nombre">Nombre *</label>
              <input
                id="p-nombre" required
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                spellCheck lang="es"
              />
            </div>
            <div className="field">
              <label htmlFor="p-descripcion">Descripción *</label>
              <textarea
                id="p-descripcion" required rows={2}
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Qué vende o para qué sirve este proveedor (ej. catering/eventos, papelería, tiquetes aéreos…)"
                spellCheck lang="es"
              />
            </div>
            <div className="field">
              <label htmlFor="p-telefono">Teléfono de contacto</label>
              <input
                id="p-telefono"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="Opcional"
                spellCheck={false}
              />
            </div>
            <div className="field">
              <label htmlFor="p-correo">Correo de contacto</label>
              <input
                id="p-correo" type="email"
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
                placeholder="Opcional"
                spellCheck={false}
              />
            </div>
            <div className="field">
              <label htmlFor="p-documentacion">Documentación al día</label>
              <label className="toggle-switch" style={{ alignSelf: "flex-start" }} title={documentacionAlDia ? "Sí, al día" : "No, pendiente"}>
                <input
                  id="p-documentacion" type="checkbox"
                  checked={documentacionAlDia}
                  onChange={(e) => setDocumentacionAlDia(e.target.checked)}
                />
                <span className="toggle-track"><span className="toggle-thumb" /></span>
              </label>
            </div>
            <div className="field">
              <label htmlFor="p-activo">Estado</label>
              <select id="p-activo" value={activo ? "1" : "0"} onChange={(e) => setActivo(e.target.value === "1")}>
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
