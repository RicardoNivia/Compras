"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { ROLES, ROLE_LIST, ROLE_LABELS, ROLE_COLOR_VARS } from "@/lib/roles";
import { setPermissionApi } from "@/lib/api";
import { IconCheck, IconAlert } from "@/components/icons";

function Cell({ row, role, allowed, onRequestChange }) {
  const locked = role === ROLES.ADMIN;

  return (
    <td className="perm-cell">
      <button
        type="button"
        className={`perm-toggle${allowed ? " on" : ""}${locked ? " locked" : ""}`}
        onClick={() => !locked && onRequestChange(row, role, !allowed)}
        disabled={locked}
        title={locked ? "El rol Administrador siempre tiene todos los permisos." : `${allowed ? "Quitar" : "Dar"} "${row.label}" a ${ROLE_LABELS[role]}`}
        aria-label={`${row.label} — ${ROLE_LABELS[role]}: ${allowed ? "permitido" : "no permitido"}`}
      >
        {allowed ? <IconCheck size={13} /> : <span className="perm-dash">—</span>}
      </button>
    </td>
  );
}

export default function PermissionsMatrix({ initialMatrix }) {
  const [matrix, setMatrix] = useState(initialMatrix || []);
  // { row, role, allowed } — el cambio propuesto, pendiente de confirmar en el modal.
  const [pending, setPending] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  function showToast(message) {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  }

  const sections = useMemo(() => {
    const map = new Map();
    for (const row of matrix) {
      if (!map.has(row.section)) map.set(row.section, []);
      map.get(row.section).push(row);
    }
    return Array.from(map.entries());
  }, [matrix]);

  function handleRequestChange(row, role, allowed) {
    setError("");
    setPending({ row, role, allowed });
  }

  async function handleConfirm() {
    if (!pending) return;
    setSaving(true);
    setError("");
    try {
      await setPermissionApi(pending.role, pending.row.key, pending.allowed);
      setMatrix((prev) => prev.map((r) => (
        r.key === pending.row.key ? { ...r, roles: { ...r.roles, [pending.role]: pending.allowed } } : r
      )));
      showToast(`Guardado: ${ROLE_LABELS[pending.role]} ${pending.allowed ? "ahora tiene" : "ya no tiene"} "${pending.row.label}".`);
      setPending(null);
    } catch (err) {
      setError(err.message || "No se pudo guardar el permiso.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="table-card">
      <div style={{ padding: "16px 18px 4px" }}>
        <p className="card-sub" style={{ margin: 0 }}>
          Marca o quita el acceso de un rol a una funcionalidad, agrupadas por sección. Cada cambio pide confirmación y queda registrado en Auditoría. El rol Administrador siempre tiene todos los permisos.
        </p>
      </div>
      <div className="scroll-x">
        <table className="plain-table perm-matrix">
          <thead>
            <tr>
              <th>Funcionalidad</th>
              {ROLE_LIST.map((role) => (
                <th key={role} className="perm-role-col">
                  <span className="perm-role-badge" style={{ "--rc": `var(${ROLE_COLOR_VARS[role]})` }}>
                    {ROLE_LABELS[role][0]}
                  </span>
                  <div>{ROLE_LABELS[role]}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sections.map(([section, rows]) => (
              <Fragment key={section}>
                <tr className="perm-section-row">
                  <td colSpan={ROLE_LIST.length + 1}>{section}</td>
                </tr>
                {rows.map((row) => (
                  <tr key={row.key}>
                    <td>{row.label}</td>
                    {ROLE_LIST.map((role) => (
                      <Cell key={role} row={row} role={role} allowed={row.roles[role]} onRequestChange={handleRequestChange} />
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {pending && (
        <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) setPending(null); }}>
          <div className="modal">
            <div className="modal-head">
              <h3>{pending.allowed ? "Dar" : "Quitar"} permiso</h3>
              {!saving && (
                <button type="button" className="btn-ghost icon-btn" onClick={() => setPending(null)} aria-label="Cerrar">✕</button>
              )}
            </div>
            <div className="modal-body">
              <p>
                {pending.allowed ? "Vas a dar" : "Vas a quitar"} el permiso de <strong>&quot;{pending.row.label}&quot;</strong> al rol{" "}
                <strong>{ROLE_LABELS[pending.role]}</strong>.
                {pending.allowed
                  ? " Ese rol podrá usar esta funcionalidad de inmediato."
                  : " Ese rol dejará de poder usar esta funcionalidad de inmediato."}
                {" "}Este cambio queda registrado en Auditoría.
              </p>
              {error && <div className="modal-error" style={{ marginTop: 10 }}><IconAlert size={13} /> {error}</div>}
            </div>
            <div className="modal-foot">
              <button type="button" className="btn" onClick={() => setPending(null)} disabled={saving}>Cancelar</button>
              <button type="button" className={`btn ${pending.allowed ? "btn-primary" : "btn-danger-solid"}`} onClick={handleConfirm} disabled={saving}>
                {saving && <span className="spinner" />}
                {saving ? "Guardando…" : pending.allowed ? "Sí, dar permiso" : "Sí, quitar permiso"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="toast toast-good" role="status">
          <IconCheck size={13} /> {toast}
        </div>
      )}
    </div>
  );
}
