"use client";

import { useMemo, useState } from "react";
import UserModal from "@/components/UserModal";
import { ROLE_LABELS, ROLE_LIST, ROLE_COLOR_VARS, ROLE_ICONS } from "@/lib/roles";

function initials(name) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

function EditIcon() {
  return (
    <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13.5 3.5a1.9 1.9 0 0 1 2.7 2.7L6.8 15.6l-3.4.9.9-3.4 9.2-9.6Z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h12M8 6V4.5A1.5 1.5 0 0 1 9.5 3h1A1.5 1.5 0 0 1 12 4.5V6m-6.5 0 .6 9.4A1.6 1.6 0 0 0 7.7 17h4.6a1.6 1.6 0 0 0 1.6-1.6l.6-9.4" />
    </svg>
  );
}

export default function UsuariosView({ initialUsers }) {
  const [users, setUsers] = useState(initialUsers || []);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [modalUser, setModalUser] = useState(undefined); // undefined = closed, null = new
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const roleCounts = useMemo(() => {
    const counts = Object.fromEntries(ROLE_LIST.map((r) => [r, 0]));
    for (const u of users) counts[u.role] = (counts[u.role] || 0) + 1;
    return counts;
  }, [users]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter && u.role !== roleFilter) return false;
      if (q && !`${u.nombre} ${u.email}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [users, search, roleFilter]);

  function handleSaved(saved, isEdit) {
    setUsers((prev) => (isEdit ? prev.map((u) => (u.id === saved.id ? saved : u)) : [...prev, saved]));
    setModalUser(undefined);
  }

  async function handleDelete(id) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
      if (res.ok) setUsers((prev) => prev.filter((u) => u.id !== id));
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  }

  return (
    <div>
      <div className="role-summary-row">
        {ROLE_LIST.map((r) => {
          const active = roleFilter === r;
          return (
            <button
              key={r}
              type="button"
              className={`role-summary-chip${active ? " active" : ""}`}
              style={{ "--rc": `var(${ROLE_COLOR_VARS[r]})` }}
              onClick={() => setRoleFilter(active ? "" : r)}
              title={`Filtrar por ${ROLE_LABELS[r]}`}
            >
              <span className="role-summary-ic">{ROLE_ICONS[r]}</span>
              <span className="role-summary-count">{roleCounts[r] || 0}</span>
              <span className="role-summary-label">{ROLE_LABELS[r]}</span>
            </button>
          );
        })}
      </div>

      <div className="view-head">
        <div className="field search-field" style={{ maxWidth: 320 }}>
          <label htmlFor="u-search">Buscar</label>
          <input
            id="u-search" type="search" placeholder="Nombre o correo…"
            value={search} onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="spacer" />
        <button type="button" className="btn btn-primary" onClick={() => setModalUser(null)}>
          + Agregar usuario
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="table-card"><div className="empty">No hay usuarios que coincidan con la búsqueda.</div></div>
      ) : (
        <div className="user-grid">
          {filtered.map((u) => {
            const colorVar = `var(${ROLE_COLOR_VARS[u.role] || "--muted"})`;
            const confirming = confirmDeleteId === u.id;
            return (
              <div key={u.id} className="user-card" style={{ "--rc": colorVar }}>
                <div className="user-card-top">
                  <div className="user-avatar">{initials(u.nombre)}</div>
                  <span className={`user-status-dot${u.activo ? "" : " off"}`} title={u.activo ? "Activo" : "Inactivo"} />
                </div>
                <div className="user-card-name">{u.nombre}</div>
                <div className="user-card-email">{u.email}</div>
                <div className="user-card-role">
                  <span className="role-badge">
                    <span className="role-badge-ic">{ROLE_ICONS[u.role]}</span>
                    {ROLE_LABELS[u.role] || u.role}
                  </span>
                </div>

                <div className="user-card-actions">
                  {confirming ? (
                    <div className="confirm-del">
                      <span>¿Eliminar?</span>
                      <button type="button" className="btn btn-danger-solid small" disabled={deletingId === u.id} onClick={() => handleDelete(u.id)}>
                        {deletingId === u.id ? <span className="spinner" /> : "Sí"}
                      </button>
                      <button type="button" className="btn small" disabled={deletingId === u.id} onClick={() => setConfirmDeleteId(null)}>No</button>
                    </div>
                  ) : (
                    <>
                      <button type="button" className="user-action-btn edit" onClick={() => setModalUser(u)} title="Editar">
                        <EditIcon />
                      </button>
                      <button type="button" className="user-action-btn delete" onClick={() => setConfirmDeleteId(u.id)} title="Eliminar">
                        <TrashIcon />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modalUser !== undefined && (
        <UserModal user={modalUser} onClose={() => setModalUser(undefined)} onSaved={handleSaved} />
      )}
    </div>
  );
}
