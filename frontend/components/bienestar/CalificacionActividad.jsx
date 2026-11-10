"use client";

import { useEffect, useState } from "react";
import { fmtCOP, fmtDateTime } from "@/lib/format";
import { fetchActividadApi, generarAnalisisActividadApi } from "@/lib/api";
import { IconSpark, IconStar, IconAlert } from "@/components/icons";
import { rangoHumano } from "@/components/bienestar/actividadesUi";
import { EsqueletoAnalisis } from "@/components/bienestar/Esqueletos";

const TIPOS = { logro: "Lo que funcionó", alerta: "Para revisar", idea: "Para la próxima" };

export function Estrellas({ valor, onElegir }) {
  return (
    <span className="ficha-estrellas" role={onElegir ? "radiogroup" : "img"} aria-label={`${valor || 0} de 5`}>
      {[1, 2, 3, 4, 5].map((n) => (onElegir ? (
        <button key={n} type="button" role="radio" aria-checked={valor === n} aria-label={`${n} de 5`} className={`ficha-estrella${n <= (valor || 0) ? " on" : ""}`} onClick={() => onElegir(n)}>
          <IconStar size={26} filled={n <= (valor || 0)} />
        </button>
      ) : (
        <span key={n} className={`ficha-estrella${n <= (valor || 0) ? " on" : ""}`}><IconStar size={14} filled={n <= (valor || 0)} /></span>
      )))}
    </span>
  );
}

// El análisis de Nova de la actividad y su puntaje, al lado de la calificación que puso quien la cerró. Se genera al
// cerrarla; mientras tanto, si ya se ejecutó, se puede pedir desde aquí.
export function AnalisisDeActividad({ act, puedeEditar, onCambio, soloNova = false }) {
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState("");
  const a = act.analisisNova;
  const yaOcurrio = act.estado === "ejecutada" || act.estado === "cerrada";

  async function generar() {
    setGenerando(true);
    setError("");
    try {
      await generarAnalisisActividadApi(act.id);
      onCambio();
    } catch (e) {
      setError(e.message || "Nova no pudo generar el análisis. Intenta de nuevo.");
    } finally {
      setGenerando(false);
    }
  }

  return (
    <section className="resumen-card resumen-lectura" aria-labelledby="f-nova" aria-busy={generando}>
      <div className="resumen-lectura-head">
        <h2 id="f-nova"><IconSpark size={15} /> {soloNova ? "Calificación de Nova" : "Análisis de Nova"}</h2>
        {puedeEditar && yaOcurrio && (
          <button type="button" className="btn small" onClick={generar} disabled={generando}>
            {generando && <span className="spinner" />} {generando ? "Nova está analizando…" : a ? "Analizar de nuevo" : "Generar análisis"}
          </button>
        )}
      </div>
      {a ? (
        <>
          <div className="ficha-puntajes">
            {a.puntaje != null
              ? <div><span>Puntaje de Nova</span><Estrellas valor={a.puntaje} /><strong>{a.puntaje} de 5</strong></div>
              : <div><span>Puntaje de Nova</span><strong>Sin datos para calificar</strong></div>}
            {!soloNova && act.calificacion != null && <div><span>Calificación de {act.cerradaPorNombre || "quien la cerró"}</span><Estrellas valor={act.calificacion} /><strong>{act.calificacion} de 5</strong></div>}
          </div>
          <strong className="resumen-lectura-titulo">{a.titulo}</strong>
          <p>{a.resumen}</p>
          {a.puntos.length > 0 && (
            <ul className="resumen-lectura-puntos">
              {a.puntos.map((pt, i) => (
                <li key={i} className={pt.tipo}>
                  <span>{TIPOS[pt.tipo]}</span>
                  {pt.texto}
                </li>
              ))}
            </ul>
          )}
          <span className="count-note">Generado el {fmtDateTime(a.generadoAt)}{a.creadoPorNombre ? ` · ${a.creadoPorNombre}` : ""}</span>
        </>
      ) : (
        <p>{yaOcurrio ? "Nova aún no ha analizado esta actividad. Lo hace sola en las próximas horas, o puedes pedirlo ahora con el botón." : "Nova la analizará y le pondrá su puntaje de 1 a 5 cuando se realice."}</p>
      )}
      {error && <div className="modal-error">{error}</div>}
    </section>
  );
}

// Las dos calificaciones, que son distintas: la de Nova, con su detalle, y la que puso la persona al cerrar.
export function TabCalificaciones({ act, puedeEditar, onCambio }) {
  return (
    <div className="calificaciones-tab">
      <section className="resumen-card calificacion-usuario" aria-labelledby="f-usuario">
        <h2 id="f-usuario">Calificación del usuario</h2>
        <p className="card-sub">La que puso quien cerró la actividad.</p>
        {act.calificacion != null ? (
          <>
            <div className="calificacion-valor"><Estrellas valor={act.calificacion} /> <strong>{act.calificacion} de 5</strong></div>
            {act.comentarioCierre ? <blockquote className="calificacion-comentario">“{act.comentarioCierre}”</blockquote> : <p className="count-note">Cerró sin dejar comentario.</p>}
            <span className="count-note">{act.cerradaPorNombre || "—"}{act.cerradaAt ? ` · ${fmtDateTime(act.cerradaAt)}` : ""}</span>
          </>
        ) : <p className="count-note">Se pone al cerrar la actividad.</p>}
      </section>
      <AnalisisDeActividad act={act} puedeEditar={puedeEditar} onCambio={onCambio} soloNova />
    </div>
  );
}

// Al hacer clic en la calificación de una actividad (tabla o ficha): calificación, análisis y cifras, como la valoración
// de Nova de una compra.
export function CalificacionModal({ actividadId, puedeEditar, onClose, onCambio }) {
  const [act, setAct] = useState(null);
  const [error, setError] = useState("");

  function cargar() {
    return fetchActividadApi(actividadId).then((r) => setAct(r.actividad)).catch((e) => setError(e.message || "No se pudo cargar la actividad."));
  }
  useEffect(() => {
    cargar();
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actividadId]);

  const p = act?.participacion;
  const inscritos = p?.inscritos || act?.inscritos;
  const asistieron = p?.asistieron || act?.asistentes;

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal kpi-explain-modal calificacion-modal" role="dialog" aria-modal="true" aria-labelledby="cal-titulo">
        <div className="modal-head">
          <div className="kpi-explain-modal-title">
            <span className="kpi-explain-modal-ic"><IconStar size={16} filled /></span>
            <div>
              <h3 id="cal-titulo">Calificación y análisis</h3>
              <p className="card-sub" style={{ margin: 0 }}>{act ? `${act.nombre} · ${rangoHumano(act)}` : "Cargando…"}</p>
            </div>
          </div>
          <button type="button" className="btn-ghost icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div className="calificacion-modal-body">
          {error && <div className="modal-error"><IconAlert size={13} /> {error}</div>}
          {!act && !error && <div role="status" aria-busy="true" aria-label="Cargando"><EsqueletoAnalisis /></div>}
          {act && (
            <>
              {act.calificacion == null && <p className="count-note" style={{ margin: 0 }}>La calificación se pone al cerrar la actividad.</p>}
              {act.comentarioCierre && <blockquote className="calificacion-comentario">“{act.comentarioCierre}”<cite>{act.cerradaPorNombre || "Quien la cerró"}{act.cerradaAt ? ` · ${fmtDateTime(act.cerradaAt)}` : ""}</cite></blockquote>}
              <AnalisisDeActividad act={act} puedeEditar={puedeEditar} onCambio={() => { cargar(); onCambio?.(); }} />
              <div className="actividad-cifras">
                <div><span>Asistieron</span><strong>{asistieron != null ? `${asistieron}${inscritos ? ` de ${inscritos}` : ""}` : "—"}</strong></div>
                <div><span>Asistentes que calificaron</span><strong>{p.calificaciones ? `${p.calificacionPromedio.toFixed(1).replace(".", ",")} / 5 (${p.calificaciones})` : "—"}</strong></div>
                <div><span>Gastado</span><strong>{fmtCOP(act.gastado || 0)}</strong></div>
                <div><span>Presupuesto</span><strong>{act.presupuesto != null ? fmtCOP(act.presupuesto) : "Sin asignar"}</strong></div>
              </div>
            </>
          )}
        </div>
        <div className="modal-foot"><button type="button" className="btn" onClick={onClose}>Cerrar</button></div>
      </div>
    </div>
  );
}
