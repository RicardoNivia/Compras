"use client";

import { useState } from "react";
import { ROLE_LABELS, ROLE_LIST } from "@/lib/roles";

const emptyForm = { nombre: "", email: "", role: "registro", activo: true, password: "" };

// roles: [{ clave, nombre }] — del sistema y personalizados; sin la lista, solo los del sistema.
export default function UserModal({ user, roles, onClose, onSaved }) {
  const opcionesRol = roles?.length ? roles : ROLE_LIST.map((clave) => ({ clave, nombre: ROLE_LABELS[clave] }));
  const isEdit = !!user;
  const [form, setForm] = useState(() => (user ? { ...emptyForm, ...user, password: "" } : emptyForm));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!form.nombre.trim() || !form.email.trim()) {
      setError("Nombre y correo son obligatorios.");
      return;
    }
    if (!isEdit && form.password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }

    setSaving(true);
    try {
      const payload = { nombre: form.nombre, email: form.email, role: form.role, activo: form.activo };
      if (form.password) payload.password = form.password;

      const res = await fetch(isEdit ? `/api/users/${user.id}` : "/api/users", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "No se pudo guardar el usuario.");
        setSaving(false);
        return;
      }
      onSaved(data, isEdit);
    } catch {
      setError("No se pudo conectar con el servidor.");
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-head">
          <h3>{isEdit ? "Editar usuario" : "Agregar usuario"}</h3>
          <button type="button" className="btn-ghost icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="field full">
              <label htmlFor="u-nombre">Nombre *</label>
              <input id="u-nombre" required value={form.nombre} onChange={(e) => update("nombre", e.target.value)} />
            </div>
            <div className="field full">
              <label htmlFor="u-email">Correo *</label>
              <input id="u-email" type="email" required value={form.email} onChange={(e) => update("email", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="u-role">Rol</label>
              <select id="u-role" value={form.role} onChange={(e) => update("role", e.target.value)}>
                {opcionesRol.map((r) => <option key={r.clave} value={r.clave}>{r.nombre}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="u-activo">Estado</label>
              <select id="u-activo" value={form.activo ? "1" : "0"} onChange={(e) => update("activo", e.target.value === "1")}>
                <option value="1">Activo</option>
                <option value="0">Inactivo</option>
              </select>
            </div>
            <div className="field full">
              <label htmlFor="u-password">{isEdit ? "Nueva contraseña (opcional)" : "Contraseña *"}</label>
              <input
                id="u-password" type="password" autoComplete="new-password"
                value={form.password} onChange={(e) => update("password", e.target.value)}
                placeholder={isEdit ? "Dejar en blanco para no cambiarla" : "Mínimo 6 caracteres"}
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
      </div>
    </div>
  );
}
