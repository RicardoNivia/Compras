"use client";

import { useEffect, useState } from "react";
import { updateActividadApi, generarAnalisisActividadApi, fetchMaestroTipoApi } from "@/lib/api";
import { Estrellas } from "@/components/bienestar/CalificacionActividad";

// Se puede cerrar una actividad que ya se ejecutó. Devuelve por qué no, si no se puede.
export function razonParaNoCerrar(act) {
  if (act.estado === "cerrada") return "La actividad ya está cerrada.";
  if (act.estado !== "ejecutada") return "Primero marca la actividad como ejecutada.";
  return null;
}

// Confirmar el cierre de una actividad: avisa que ya no se podrá modificar y pide la calificación.
export default function CerrarActividadModal({ act, onClose, onCerrada }) {
  const [calificacion, setCalificacion] = useState(0);
  const [comentario, setComentario] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [analizando, setAnalizando] = useState(false);
  const [escala, setEscala] = useState({});
  useEffect(() => { fetchMaestroTipoApi("escalaCalificacion").then((r) => setEscala(Object.fromEntries(r.maestros.map((m) => [m.aplicaEstrellas, m.valor])))).catch(() => {}); }, []);
  async function guardar() {
    if (!calificacion) return setError("Califica la actividad de 1 a 5.");
    setSaving(true);
    setError("");
    try {
      await updateActividadApi(act.id, { estado: "cerrada", calificacion, comentarioCierre: comentario });
    } catch (e) {
      setError(e.message);
      setSaving(false);
      return;
    }
    // El cierre ya quedó. Si Nova falla no se deshace: la revisión automática vuelve a intentarlo.
    setAnalizando(true);
    await generarAnalisisActividadApi(act.id, "cierre").catch(() => {});
    onCerrada();
  }
  const sinRegistrar = act.aplicaParticipantes === false ? 0 : act.participacion?.sinRegistrar || 0;
  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="ce-t">
        <div className="modal-head"><h3 id="ce-t">Cerrar “{act.nombre}”</h3><button type="button" className="btn-ghost icon-btn" onClick={onClose} aria-label="Cerrar">✕</button></div>
        <div className="modal-body" style={{ display: "block" }}>
          <div className="cerrar-aviso" role="alert">
            <strong>Esta acción no se puede deshacer.</strong>
            <p>Al cerrar la actividad no se podrá modificar su configuración ni nada más: sus datos, participantes, inventario, fotos, formulario y compras asociadas quedan como están. Las solicitudes de compra sin atender se cancelan. Queda tu calificación y Nova genera su análisis final.</p>
          </div>
          {sinRegistrar > 0 && <p className="modal-error">{sinRegistrar} inscrito(s) siguen sin asistencia registrada.</p>}
          <div className="field">
            <span className="ficha-import-titulo">¿Cómo salió la actividad? *</span>
            <Estrellas valor={calificacion} onElegir={setCalificacion} />
            {calificacion > 0 && escala[calificacion] && <span className="ficha-escala">{escala[calificacion]}</span>}
          </div>
          <div className="field" style={{ marginTop: 10 }}>
            <label htmlFor="ce-com">Comentario de cierre</label>
            <textarea id="ce-com" rows={3} value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Qué funcionó, qué mejorar, novedades con proveedores…" />
          </div>
          {error && <div className="modal-error" style={{ marginTop: 8 }}>{error}</div>}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn btn-primary" onClick={guardar} disabled={saving}>{saving && <span className="spinner" />} {analizando ? "Nova está analizando…" : "Sí, cerrar actividad"}</button>
          <button type="button" className="btn" onClick={onClose} disabled={saving}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}
