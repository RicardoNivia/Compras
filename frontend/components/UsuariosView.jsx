"use client";

import { useMemo, useState } from "react";
import UserModal from "@/components/UserModal";
import PermissionsMatrix from "@/components/PermissionsMatrix";
import RolesView from "@/components/RolesView";
import { fetchRolesApi, fetchPermissionsMatrix } from "@/lib/api";
import { ROLE_LABELS, ROLE_LIST, ROLE_COLOR_VARS, ROLE_ICONS } from "@/lib/roles";
import { crossfade } from "@/lib/crossfade";

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

export default function UsuariosView({ initialUsers, initialPermissionsMatrix, initialRoles }) {
  const [tab, setTab] = useState("usuarios"); // "usuarios" | "roles" | "permisos"
  // Roles del sistema y personalizados (Usuarios › Roles); sin la lista del servidor, solo los del sistema.
  const [roles, setRoles] = useState(initialRoles?.length ? initialRoles : ROLE_LIST.map((clave) => ({ clave, nombre: ROLE_LABELS[clave], sistema: true, funcionalidades: [], usuarios: 0 })));
  const [matrix, setMatrix] = useState(initialPermissionsMatrix || []);
  const nombreRol = (clave) => roles.find((r) => r.clave === clave)?.nombre || ROLE_LABELS[clave] || clave;

  // Tras crear, editar o eliminar un rol (o cambiar la Matriz) se vuelven a pedir ambos: comparten los mismos datos.
  async function refrescarRoles() {
    const [r, m] = await Promise.all([fetchRolesApi(), fetchPermissionsMatrix()]);
    setRoles(r.roles);
    setMatrix(m.matrix);
  }
  const [users, setUsers] = useState(initialUsers || []);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [moduloFilter, setModuloFilter] = useState("");
  // Módulos de un rol según la Matriz: los que tienen al menos una funcionalidad permitida.
  const modulosDeRol = (rol) => ["Compras", "Bienestar"].filter((mod) => matrix.some((r) => r.modulo === mod && r.roles?.[rol]));
  const cumpleModulo = (u) => !moduloFilter || modulosDeRol(u.role).includes(moduloFilter);
  const [modalUser, setModalUser] = useState(undefined); // undefined = closed, null = new
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const roleCounts = useMemo(() => {
    const counts = Object.fromEntries(roles.map((r) => [r.clave, 0]));
    for (const u of users) counts[u.role] = (counts[u.role] || 0) + 1;
    return counts;
  }, [users, roles]);

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
      <div className="dash-tabs" role="tablist" aria-label="Vista de usuarios" style={{ marginBottom: 16 }}>
        <button type="button" role="tab" aria-selected={tab === "usuarios"} className="dash-tab" onClick={() => crossfade(() => setTab("usuarios"))}>
          Usuarios
        </button>
        <button type="button" role="tab" aria-selected={tab === "roles"} className="dash-tab" onClick={() => crossfade(() => setTab("roles"))}>
          Roles
        </button>
        <button type="button" role="tab" aria-selected={tab === "permisos"} className="dash-tab" onClick={() => crossfade(() => setTab("permisos"))}>
          Matriz de permisos
        </button>
      </div>

      {tab === "roles" ? (
        <RolesView roles={roles} features={matrix.map(({ key, label, section, modulo }) => ({ key, label, section: `${modulo} · ${section}` }))} onCambio={refrescarRoles} />
      ) : tab === "permisos" ? (
        <PermissionsMatrix initialMatrix={matrix} roles={roles} onChanged={() => refrescarRoles().catch(() => {})} />
      ) : (
        <>
      <div className="role-summary-row">
        {roles.map(({ clave: r, nombre }) => {
          const active = roleFilter === r;
          return (
            <button
              key={r}
              type="button"
              className={`role-summary-chip${active ? " active" : ""}`}
              style={{ "--rc": `var(${ROLE_COLOR_VARS[r] || "--sOther"})` }}
              onClick={() => setRoleFilter(active ? "" : r)}
              title={`Filtrar por ${nombre}`}
            >
              <span className="role-summary-ic">{ROLE_ICONS[r] || nombre[0]}</span>
              <span className="role-summary-count">{roleCounts[r] || 0}</span>
              <span className="role-summary-label">{nombre}</span>
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
        <div className="field" style={{ maxWidth: 190 }}>
          <label htmlFor="u-modulo">Módulo</label>
          <select id="u-modulo" value={moduloFilter} onChange={(e) => setModuloFilter(e.target.value)}>
            <option value="">Todos</option>
            <option value="Compras">Compras</option>
            <option value="Bienestar">Bienestar y Fundación</option>
          </select>
        </div>
        <div className="spacer" />
        <button type="button" className="btn btn-primary" onClick={() => setModalUser(null)}>
          + Agregar usuario
        </button>
      </div>

      {filtered.filter(cumpleModulo).length === 0 ? (
        <div className="table-card"><div className="empty">No hay usuarios que coincidan con la búsqueda.</div></div>
      ) : (
        <div className="user-grid">
          {filtered.filter(cumpleModulo).map((u) => {
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
                    <span className="role-badge-ic">{ROLE_ICONS[u.role] || nombreRol(u.role)[0]}</span>
                    {nombreRol(u.role)}
                  </span>
                </div>
                <div className="user-card-modulos">
                  {modulosDeRol(u.role).map((m) => <span key={m} className={`user-modulo ${m.toLowerCase()}`}>{m}</span>)}
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
        <UserModal user={modalUser} roles={roles} onClose={() => setModalUser(undefined)} onSaved={handleSaved} />
      )}
        </>
      )}
    </div>
  );
}
