"use client";

import { useState } from "react";
import { changePasswordApi } from "@/lib/api";

const emptyForm = { currentPassword: "", newPassword: "", confirmPassword: "" };

export default function ChangePasswordModal({ onClose }) {
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!form.currentPassword || !form.newPassword || !form.confirmPassword) {
      setError("Todos los campos son obligatorios.");
      return;
    }
    if (form.newPassword.length < 6) {
      setError("La nueva contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (form.newPassword !== form.confirmPassword) {
      setError("La nueva contraseña y su confirmación no coinciden.");
      return;
    }

    setSaving(true);
    try {
      await changePasswordApi(form.currentPassword, form.newPassword);
      setSuccess(true);
    } catch (err) {
      setError(err.message || "No se pudo cambiar la contraseña.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-head">
          <h3>Cambiar contraseña</h3>
          <button type="button" className="btn-ghost icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>

        {success ? (
          <>
            <div className="modal-body">
              <p className="field full">Tu contraseña se actualizó correctamente.</p>
            </div>
            <div className="modal-foot">
              <button type="button" className="btn btn-primary" onClick={onClose}>Cerrar</button>
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="modal-body">
              <div className="field full">
                <label htmlFor="cp-current">Contraseña actual *</label>
                <input
                  id="cp-current" type="password" autoComplete="current-password" required
                  value={form.currentPassword} onChange={(e) => update("currentPassword", e.target.value)}
                />
              </div>
              <div className="field full">
                <label htmlFor="cp-new">Nueva contraseña *</label>
                <input
                  id="cp-new" type="password" autoComplete="new-password" required
                  value={form.newPassword} onChange={(e) => update("newPassword", e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                />
              </div>
              <div className="field full">
                <label htmlFor="cp-confirm">Confirmar nueva contraseña *</label>
                <input
                  id="cp-confirm" type="password" autoComplete="new-password" required
                  value={form.confirmPassword} onChange={(e) => update("confirmPassword", e.target.value)}
                />
              </div>

              {error && <div className="modal-error full" style={{ gridColumn: "1 / -1" }}>{error}</div>}
            </div>

            <div className="modal-foot">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving && <span className="spinner" />}
                {saving ? "Guardando…" : "Guardar"}
              </button>
              <button type="button" className="btn" onClick={onClose} disabled={saving}>Cancelar</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
