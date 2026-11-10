"use client";

import { useCallback, useEffect, useState } from "react";
import { fmtCOP, fmtDateTime } from "@/lib/format";
import { fetchSolicitudesActividadApi, crearSolicitudCompraApi, cancelarSolicitudCompraApi } from "@/lib/api";
import Link from "next/link";
import { IconPlus, IconSpark } from "@/components/icons";
import { EsqueletoLista } from "@/components/bienestar/Esqueletos";
import { EVENTO_REVISAR } from "@/components/notificaciones/AvisosEnVivo";

const ESTADOS = {
  pendiente: { label: "Pendiente", pill: "warning" },
  creada: { label: "Compra creada", pill: "good" },
  rechazada: { label: "Rechazada", pill: "critical" },
  cancelada: { label: "Cancelada", pill: "muted" },
};

// Solicitudes de compra de una actividad (pestaña Compras de la ficha): pedirle a Compras una compra para esta actividad
// y ver en qué va cada una. La atiende quien puede crear compras, en Alertas y notificaciones › Solicitudes de compra.
export default function SolicitudesActividad({ actividadId, puedeSolicitar, onCambio }) {
  const [lista, setLista] = useState(null);
  const [nueva, setNueva] = useState(false);
  const [error, setError] = useState("");

  const cargar = useCallback(() => {
    fetchSolicitudesActividadApi(actividadId).then((r) => setLista(r.solicitudes)).catch((e) => { setLista([]); setError(e.message); });
  }, [actividadId]);
  useEffect(() => { cargar(); }, [cargar]);

  async function cancelar(s) {
    setError("");
    try {
      await cancelarSolicitudCompraApi(actividadId, s.id);
      cargar();
    } catch (e) {
      setError(e.message);
      cargar();
    }
  }

  return (
    <section className="solicitudes-actividad" aria-labelledby="sa-titulo">
      <div className="solicitudes-actividad-head">
        <h3 id="sa-titulo">Solicitudes a Compras</h3>
        {puedeSolicitar && <Link href={`/bienestar/agentes?tab=sugeridas&actividad=${actividadId}`} className="btn small"><IconSpark size={13} /> Sugerir compras con Nova</Link>}
        {puedeSolicitar && <button type="button" className="btn btn-primary small" onClick={() => setNueva(true)}><IconPlus size={13} /> Solicitar compra</button>}
      </div>
      {error && <div className="modal-error">{error}</div>}
      {lista === null ? (
        <EsqueletoLista filas={2} etiqueta="Cargando las solicitudes" />
      ) : lista.length === 0 ? (
        <p className="count-note">Aún no se ha solicitado ninguna compra para esta actividad.</p>
      ) : (
        <ul className="solicitudes-lista">
          {lista.map((s) => {
            const e = ESTADOS[s.estado] || ESTADOS.pendiente;
            return (
              <li key={s.id}>
                <div className="solicitudes-lista-fila">
                  <span className="desc-tooltip-wrap solicitudes-lista-desc">
                    <span className="desc-text">{s.descripcion}</span>
                    <span className="desc-tooltip-bubble">{s.descripcion}</span>
                  </span>
                  <span className={`pill ${e.pill}`}>{e.label}{s.estado === "creada" && s.recordSeq ? ` #${s.recordSeq}` : ""}</span>
                  {s.estado === "pendiente" && puedeSolicitar && <button type="button" className="btn small" onClick={() => cancelar(s)}>Cancelar</button>}
                </div>
                <span className="count-note">
                  {[s.fechaRequerida ? `Debe llegar el ${s.fechaRequerida}` : null, s.valorEstimado != null ? fmtCOP(s.valorEstimado) : null, s.categoria, `Pedida por ${s.creadoPorNombre || "—"} el ${fmtDateTime(s.createdAt)}`, s.atendidaPorNombre && s.estado !== "cancelada" ? `Atendida por ${s.atendidaPorNombre}` : null].filter(Boolean).join(" · ")}
                </span>
                {s.estado === "rechazada" && <p className="solicitudes-motivo"><strong>Motivo del rechazo:</strong> {s.motivoRechazo}</p>}
              </li>
            );
          })}
        </ul>
      )}
      {nueva && <ModalSolicitar actividadId={actividadId} onClose={() => setNueva(false)} onCreada={() => { setNueva(false); cargar(); onCambio?.(); }} />}
    </section>
  );
}

// Pedir una compra: solo qué se quiere comprar y para cuándo debe llegar. Lo demás lo completa Compras al gestionarla.
export function ModalSolicitar({ actividadId, onClose, onCreada }) {
  const [f, setF] = useState({ descripcion: "", fechaRequerida: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  async function guardar(e) {
    e.preventDefault();
    if (!f.descripcion.trim()) return setError("Indica qué quieres comprar.");
    if (!f.fechaRequerida) return setError("Indica la fecha en que debe llegar.");
    setSaving(true);
    setError("");
    try {
      await crearSolicitudCompraApi(actividadId, f);
      window.dispatchEvent(new Event(EVENTO_REVISAR));
      onCreada();
    } catch (err) {
      setError(err.message || "No se pudo enviar la solicitud.");
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="sa-nueva" style={{ maxWidth: 520 }}>
        <div className="modal-head">
          <h3 id="sa-nueva">Solicitar compra</h3>
          <button type="button" className="btn-ghost icon-btn" onClick={onClose} disabled={saving} aria-label="Cerrar">✕</button>
        </div>
        <form onSubmit={guardar}>
          <div className="modal-body" style={{ display: "block" }}>
            <p className="card-sub" style={{ marginTop: 0 }}>Compras la verá en Solicitudes de compra y la gestionará. Te avisaremos en tu Bandeja cuando la registren o la rechacen.</p>
            <div className="field">
              <label htmlFor="sa-desc">¿Qué quieres comprar? *</label>
              <textarea id="sa-desc" rows={3} autoFocus value={f.descripcion} onChange={(e) => set("descripcion", e.target.value)} placeholder="Ej.: 80 refrigerios para la jornada" />
            </div>
            <div className="field" style={{ marginTop: 10 }}>
              <label htmlFor="sa-fecha">¿Con qué fecha debe llegar? *</label>
              <input id="sa-fecha" type="date" value={f.fechaRequerida} onChange={(e) => set("fechaRequerida", e.target.value)} />
            </div>
            {error && <div className="modal-error" style={{ marginTop: 8 }}>{error}</div>}
          </div>
          <div className="modal-foot">
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving && <span className="spinner" />} Enviar solicitud</button>
            <button type="button" className="btn" onClick={onClose} disabled={saving}>Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  );
}
