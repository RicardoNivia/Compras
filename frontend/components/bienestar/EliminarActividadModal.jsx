"use client";

import { useEffect, useState } from "react";
import { deleteActividadApi, fetchEliminacionActividadApi } from "@/lib/api";
import { IconTrash } from "@/components/icons";

// Confirmar la eliminación de una actividad (desde la tabla de Actividades o desde la propia actividad). Antes de
// confirmar dice qué se borra con ella y qué vuelve a la bodega; si tiene compras asociadas o está cerrada, no deja
// eliminar y dice por qué. Queda en Auditoría (lib/actividadesBienestar.js#deleteActividad).
export default function EliminarActividadModal({ act, onClose, onEliminada }) {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    fetchEliminacionActividadApi(act.id).then(setInfo).catch((e) => setError(e.message));
  }, [act.id]);

  async function eliminar() {
    setSaving(true);
    setError("");
    try {
      await deleteActividadApi(act.id);
      onEliminada();
    } catch (e) {
      setError(e.message || "No se pudo eliminar la actividad.");
      setSaving(false);
    }
  }

  const partes = info ? [
    [info.participantes, "participante(s) con su asistencia y comentarios"],
    [info.fotos, "foto(s)"],
    [info.inventario, "ítem(s) de inventario"],
    [info.observaciones, "observación(es) del equipo"],
    [info.solicitudesPendientes, "solicitud(es) de compra pendiente(s)"],
  ].filter(([n]) => n > 0) : [];

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="el-act-t" style={{ maxWidth: 560 }}>
        <div className="modal-head">
          <h3 id="el-act-t">Eliminar “{act.nombre}”</h3>
          <button type="button" className="btn-ghost icon-btn" onClick={onClose} disabled={saving} aria-label="Cerrar">✕</button>
        </div>
        <div className="modal-body" style={{ display: "block" }}>
          {!info && !error && <span className="spinner" />}
          {info && !info.sePuede && (
            <div className="cerrar-aviso" role="alert">
              <strong>No se puede eliminar.</strong>
              <p>{info.motivo}</p>
            </div>
          )}
          {info?.sePuede && (
            <>
              <div className="eliminar-aviso" role="alert">
                <strong>Esta acción no se puede deshacer.</strong>
                <p>La actividad desaparece del cronograma, de la tabla y del resumen. Queda registrada en Auditoría con quién la eliminó y cómo estaba.</p>
              </div>
              <p className="eliminar-sub">{partes.length ? "También se borra:" : "No tiene participantes, fotos ni inventario registrados."}</p>
              {partes.length > 0 && (
                <ul className="eliminar-lista">
                  {partes.map(([n, t]) => <li key={t}><strong>{n}</strong> {t}</li>)}
                </ul>
              )}
              {info.vuelvenABodega.length > 0 && (
                <>
                  <p className="eliminar-sub">Vuelve a la bodega lo que salió de ella y no se usó:</p>
                  <ul className="eliminar-lista">
                    {info.vuelvenABodega.map((v) => <li key={v.item}><strong>{v.cantidad}</strong> {v.item}</li>)}
                  </ul>
                </>
              )}
            </>
          )}
          {error && <div className="modal-error" style={{ marginTop: 8 }}>{error}</div>}
        </div>
        <div className="modal-foot">
          {info?.sePuede && (
            <button type="button" className="btn btn-danger-solid" onClick={eliminar} disabled={saving}>
              {saving ? <span className="spinner" /> : <IconTrash size={13} />} Sí, eliminar actividad
            </button>
          )}
          <button type="button" className="btn" onClick={onClose} disabled={saving}>{info && !info.sePuede ? "Entendido" : "Cancelar"}</button>
        </div>
      </div>
    </div>
  );
}
