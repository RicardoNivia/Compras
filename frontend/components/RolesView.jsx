"use client";

import { useEffect, useMemo, useState } from "react";
import { ROLES, ROLE_COLOR_VARS } from "@/lib/roles";
import { createRolApi, updateRolApi, deleteRolApi } from "@/lib/api";
import { IconPlus, IconEdit, IconTrash } from "@/components/icons";

const PAGE_SIZES = [25, 50, 100];

// Usuarios › Roles: los 5 del sistema (con reglas propias en el código; solo se cambian sus funcionalidades) y los
// personalizados, que se crean aquí. Las funcionalidades son la misma Matriz de permisos vista por rol.
// features: [{ key, label, section }] (de la Matriz). onCambio() vuelve a pedir roles y matriz al servidor.
export default function RolesView({ roles, features, onCambio }) {
  const [modal, setModal] = useState(undefined); // undefined = cerrado, null = nuevo, objeto = editar
  const [confirmar, setConfirmar] = useState(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);

  const filtrados = useMemo(() => {
    const q = search.trim().toLowerCase();
    return roles.filter((r) => !q || `${r.nombre} ${r.descripcion || ""}`.toLowerCase().includes(q));
  }, [roles, search]);
  useEffect(() => { setPage(1); }, [search, pageSize]);
  const totalPages = Math.max(1, Math.ceil(filtrados.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtrados.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  async function eliminar(r) {
    setError("");
    try {
      await deleteRolApi(r.clave);
      setConfirmar(null);
      await onCambio();
    } catch (err) {
      setError(err.message || "No se pudo eliminar el rol.");
      setConfirmar(null);
    }
  }

  return (
    <div>
      <div className="view-head">
        <div className="field search-field" style={{ maxWidth: 320 }}>
          <label htmlFor="rol-search">Buscar</label>
          <input id="rol-search" type="search" placeholder="Nombre del rol…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="spacer" />
        <button type="button" className="btn btn-primary" onClick={() => setModal(null)}>
          <IconPlus size={13} /> Nuevo rol
        </button>
      </div>
      {error && <div className="modal-error" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="table-card">
        <div className="table-scroll">
          <table className="records roles-table">
            <thead>
              <tr>
                <th>Rol</th>
                <th>Tipo</th>
                <th>Descripción</th>
                <th className="num">Usuarios</th>
                <th className="num">Funcionalidades</th>
                <th className="actions-col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 && (
                <tr><td colSpan={6}><div className="empty">No hay roles que coincidan con la búsqueda.</div></td></tr>
              )}
              {pageRows.map((r) => (
                <tr key={r.clave}>
                  <td>
                    <span className="role-badge" style={{ "--rc": `var(${ROLE_COLOR_VARS[r.clave] || "--sOther"})` }}>{r.nombre}</span>
                  </td>
                  <td>{r.sistema ? <span className="pill muted">Del sistema</span> : <span className="pill accent">Personalizado</span>}</td>
                  <td>
                    {r.descripcion ? (
                      <span className="desc-tooltip-wrap">
                        <span className="desc-text">{r.descripcion}</span>
                        <span className="desc-tooltip-bubble">{r.descripcion}</span>
                      </span>
                    ) : <span className="muted">—</span>}
                  </td>
                  <td className="num">{r.usuarios}</td>
                  <td className="num">{r.clave === ROLES.ADMIN ? "Todas" : `${r.funcionalidades.length} de ${features.length}`}</td>
                  <td className="actions-cell">
                    {confirmar === r.clave ? (
                      <div className="confirm-del">
                        <span>¿Eliminar?</span>
                        <button type="button" className="btn btn-danger-solid small" onClick={() => eliminar(r)}>Sí</button>
                        <button type="button" className="btn small" onClick={() => setConfirmar(null)}>No</button>
                      </div>
                    ) : (
                      <div className="row-actions">
                        <button type="button" className="icon-action-btn" onClick={() => setModal(r)} title={r.clave === ROLES.ADMIN ? "Ver rol" : "Editar rol y funcionalidades"} aria-label={`Editar ${r.nombre}`}>
                          <IconEdit size={13} />
                        </button>
                        {!r.sistema && (
                          <button
                            type="button" className="icon-action-btn delete"
                            onClick={() => setConfirmar(r.clave)} disabled={r.usuarios > 0}
                            title={r.usuarios > 0 ? "Tiene usuarios: asígnales otro rol antes de eliminarlo" : "Eliminar rol"}
                            aria-label={`Eliminar ${r.nombre}`}
                          >
                            <IconTrash size={13} />
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="table-footer">
          <div className="field" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <label htmlFor="rol-pagesize" style={{ marginBottom: 0 }}>Tamaño</label>
            <select id="rol-pagesize" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
              {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="page-btns">
            <button type="button" className="btn small" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Anterior</button>
            <button type="button" className="btn small" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>Siguiente</button>
          </div>
          <span className="count-note">Página {currentPage} de {totalPages}</span>
          <div className="spacer" />
          <span className="count-note">{filtrados.length} rol(es)</span>
        </div>
      </div>

      {modal !== undefined && (
        <RolModal
          rol={modal}
          roles={roles}
          features={features}
          onClose={() => setModal(undefined)}
          onSaved={async () => { setModal(undefined); await onCambio(); }}
        />
      )}
    </div>
  );
}

function RolModal({ rol, roles, features, onClose, onSaved }) {
  const isEdit = !!rol;
  const esAdmin = rol?.clave === ROLES.ADMIN;
  const [nombre, setNombre] = useState(rol?.nombre || "");
  const [descripcion, setDescripcion] = useState(rol?.descripcion || "");
  const [elegidas, setElegidas] = useState(() => new Set(esAdmin ? features.map((f) => f.key) : rol?.funcionalidades || []));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const secciones = useMemo(() => {
    const map = new Map();
    for (const f of features) {
      if (!map.has(f.section)) map.set(f.section, []);
      map.get(f.section).push(f);
    }
    return [...map];
  }, [features]);

  function toggle(key) {
    setElegidas((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key); else n.add(key);
      return n;
    });
  }

  function copiarDe(clave) {
    const origen = roles.find((r) => r.clave === clave);
    if (origen) setElegidas(new Set(origen.clave === ROLES.ADMIN ? features.map((f) => f.key) : origen.funcionalidades));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!nombre.trim()) return setError("Ponle un nombre al rol.");
    setSaving(true);
    try {
      const funcionalidades = [...elegidas];
      if (isEdit) {
        await updateRolApi(rol.clave, rol.sistema ? { funcionalidades } : { nombre, descripcion, funcionalidades });
      } else {
        await createRolApi({ nombre, descripcion, funcionalidades });
      }
      await onSaved();
    } catch (err) {
      setError(err.message || "No se pudo guardar el rol.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal rol-modal" role="dialog" aria-modal="true" aria-labelledby="rol-modal-title">
        <div className="modal-head">
          <h3 id="rol-modal-title">{isEdit ? (esAdmin ? "Administrador" : `Rol ${rol.nombre}`) : "Nuevo rol"}</h3>
          <button type="button" className="btn-ghost icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="field">
              <label htmlFor="rol-nombre">Nombre *</label>
              <input id="rol-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={60} disabled={rol?.sistema} placeholder="Ej.: Bienestar, Gerencia, Auditor externo" />
            </div>
            <div className="field">
              <label htmlFor="rol-copiar">Copiar funcionalidades de</label>
              <select id="rol-copiar" value="" onChange={(e) => copiarDe(e.target.value)} disabled={esAdmin}>
                <option value="">Elige un rol…</option>
                {roles.filter((r) => r.clave !== rol?.clave).map((r) => <option key={r.clave} value={r.clave}>{r.nombre}</option>)}
              </select>
            </div>
            <div className="field full">
              <label htmlFor="rol-desc">Descripción</label>
              <input id="rol-desc" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={300} disabled={rol?.sistema} placeholder="Para qué sirve este rol" />
            </div>
            {rol?.sistema && !esAdmin && (
              <p className="card-sub full" style={{ margin: 0 }}>Los roles del sistema no se renombran ni se eliminan; sí puedes cambiar sus funcionalidades.</p>
            )}
            {esAdmin && <p className="card-sub full" style={{ margin: 0 }}>El Administrador siempre tiene todas las funcionalidades.</p>}

            <div className="field full rol-funcionalidades">
              <div className="rol-funcionalidades-head">
                <span>Funcionalidades</span>
                <span className="count-note">{elegidas.size} de {features.length}</span>
              </div>
              {secciones.map(([seccion, lista]) => (
                <fieldset key={seccion} className="rol-seccion">
                  <legend>{seccion}</legend>
                  {lista.map((f) => (
                    <label key={f.key} htmlFor={`rol-f-${f.key}`} className="rol-check">
                      <span>{f.label}</span>
                      <input id={`rol-f-${f.key}`} type="checkbox" checked={elegidas.has(f.key)} onChange={() => toggle(f.key)} disabled={esAdmin} />
                    </label>
                  ))}
                </fieldset>
              ))}
            </div>
            {error && <div className="modal-error full">{error}</div>}
          </div>
          <div className="modal-foot">
            {!esAdmin && (
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving && <span className="spinner" />} {isEdit ? "Guardar cambios" : "Crear rol"}
              </button>
            )}
            <button type="button" className="btn" onClick={onClose} disabled={saving}>{esAdmin ? "Cerrar" : "Cancelar"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
