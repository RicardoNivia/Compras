"use client";

import { useEffect, useState } from "react";
import { TIPO_LABELS, ESTRELLAS_CON_CAUSA, TIPOS_USUARIO } from "@/lib/maestrosTipos";
import { createMaestroApi, updateMaestroApi, fetchUsuariosDisponiblesApi } from "@/lib/api";

const ES_CAUSA_CALIFICACION = "causaCalificacion";

export default function MaestroModal({ tipo, maestro, onClose, onSaved }) {
  const isEdit = !!maestro;
  const esResponsable = TIPOS_USUARIO.includes(tipo);
  const esCausaCalificacion = tipo === ES_CAUSA_CALIFICACION;
  // Si el valor ya está en uso en registros, no se puede renombrar (rompería
  // la referencia por texto).
  const valorLocked = isEdit && maestro.enUso;
  const [valor, setValor] = useState(maestro?.valor || "");
  const [userId, setUserId] = useState(maestro?.userId || "");
  const [aplicaEstrellas, setAplicaEstrellas] = useState(maestro?.aplicaEstrellas ? String(maestro.aplicaEstrellas) : "");
  const [usuarios, setUsuarios] = useState([]);
  const [loadingUsuarios, setLoadingUsuarios] = useState(esResponsable);
  const [activo, setActivo] = useState(maestro ? maestro.activo : true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // El maestro "Responsable" no acepta texto libre: solo se puede asignar un
  // usuario ya registrado en la aplicación (ver backend/lib/maestros.js).
  useEffect(() => {
    if (!esResponsable) return;
    let cancelled = false;
    fetchUsuariosDisponiblesApi()
      .then((data) => { if (!cancelled) setUsuarios(data.usuarios || []); })
      .catch((err) => { if (!cancelled) setError(err.message || "No se pudo cargar la lista de usuarios."); })
      .finally(() => { if (!cancelled) setLoadingUsuarios(false); });
    return () => { cancelled = true; };
  }, [esResponsable]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (esResponsable) {
      if (!userId) {
        setError("Selecciona un usuario de la aplicación.");
        return;
      }
    } else if (!valor.trim()) {
      setError("El valor es obligatorio.");
      return;
    }

    if (esCausaCalificacion && !aplicaEstrellas) {
      setError("Selecciona a cuántas estrellas aplica esta causa.");
      return;
    }

    setSaving(true);
    try {
      const payload = esResponsable
        ? { userId, activo }
        : esCausaCalificacion
        ? { valor, activo, aplicaEstrellas: Number(aplicaEstrellas) }
        : { valor, activo };
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

            {esResponsable ? (
              <div className="field">
                <label htmlFor="m-usuario">Usuario de la aplicación *</label>
                {valorLocked ? (
                  <>
                    <div className="dvalue">{valor}</div>
                    <span className="card-sub" style={{ margin: 0 }}>
                      En uso en registros existentes: no se puede cambiar de usuario.
                    </span>
                  </>
                ) : loadingUsuarios ? (
                  <div className="dvalue">Cargando usuarios…</div>
                ) : (
                  <select id="m-usuario" autoFocus required value={userId} onChange={(e) => setUserId(e.target.value)}>
                    <option value="">Selecciona un usuario…</option>
                    {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                  </select>
                )}
                <span className="card-sub" style={{ margin: 0 }}>
                  Solo se pueden asignar usuarios ya registrados en Usuarios. Si la persona no aparece, créala primero ahí.
                </span>
              </div>
            ) : (
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
            )}

            {esCausaCalificacion && (
              <div className="field">
                <label htmlFor="m-estrellas">Aplica a estrellas *</label>
                <select
                  id="m-estrellas" required
                  value={aplicaEstrellas}
                  onChange={(e) => setAplicaEstrellas(e.target.value)}
                >
                  <option value="">Selecciona…</option>
                  {ESTRELLAS_CON_CAUSA.map((n) => (
                    <option key={n} value={n}>{"★".repeat(n)} ({n} estrella{n === 1 ? "" : "s"})</option>
                  ))}
                </select>
                <span className="card-sub" style={{ margin: 0 }}>
                  Esta causa solo se ofrecerá al calificar con esta cantidad exacta de estrellas.
                </span>
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
