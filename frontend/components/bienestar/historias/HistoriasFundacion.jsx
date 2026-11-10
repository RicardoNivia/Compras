"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchHistoriasApi, urlFoto } from "@/lib/api";
import { AnimatedNumber } from "@/components/charts/chartKit";
import { crossfade } from "@/lib/crossfade";
import Reproductor from "@/components/bienestar/historias/Reproductor";
import { fechaCorta, Corazon, LOGO } from "@/components/bienestar/historias/comun";

const entero = (v) => Math.round(v || 0).toLocaleString("es-CO");
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

// Historias de Fundación: las jornadas realizadas de Conectando Corazones, cada una lista para verse como presentación
// (Reproductor) o descargarse en PDF. Todo sale de /api/actividades/historias; aquí no se calcula ninguna cifra nueva.
export default function HistoriasFundacion() {
  const anioActual = new Date().getFullYear();
  const [anio, setAnio] = useState(anioActual);
  const [mes, setMes] = useState(0);
  const [soloFotos, setSoloFotos] = useState(false);
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const [reproduce, setReproduce] = useState(null); // { modo: "jornada", id } | { modo: "anio" }
  const [pdf, setPdf] = useState(false);
  const [abriendo, setAbriendo] = useState(false);

  useEffect(() => {
    setDatos(null);
    setError("");
    fetchHistoriasApi(anio).then(setDatos).catch((e) => setError(e.message));
  }, [anio]);

  const mesesConJornadas = useMemo(() => [...new Set((datos?.jornadas || []).map((j) => Number(j.fecha.slice(5, 7))))].sort((a, b) => a - b), [datos]);
  const visibles = useMemo(() => (datos?.jornadas || [])
    .filter((j) => !mes || Number(j.fecha.slice(5, 7)) === mes)
    .filter((j) => !soloFotos || j.fotos.length), [datos, mes, soloFotos]);

  async function descargarPdf() {
    setPdf(true);
    try {
      const { generarPdfHistorias } = await import("@/components/bienestar/historias/pdfHistorias");
      await generarPdfHistorias(datos);
    } catch (e) {
      setError(`No se pudo armar el PDF: ${e.message}`);
    } finally {
      setPdf(false);
    }
  }

  // "¿Qué es Conectando Corazones?": fotos al azar de las jornadas del año (y del anterior si hay pocas), barajadas
  // cada vez que se abre.
  async function abrirPrograma() {
    setAbriendo(true);
    let jornadas = datos?.jornadas || [];
    const contar = (js) => js.reduce((s, j) => s + j.fotos.length, 0);
    if (contar(jornadas) < 13) {
      try { jornadas = [...jornadas, ...((await fetchHistoriasApi(anio - 1)).jornadas || [])]; } catch { /* con las que haya */ }
    }
    const fotos = jornadas.flatMap((j) => j.fotos.map((f) => ({ actividadId: j.id, id: f.id })));
    for (let i = fotos.length - 1; i > 0; i--) { const k = Math.floor(Math.random() * (i + 1)); [fotos[i], fotos[k]] = [fotos[k], fotos[i]]; }
    setAbriendo(false);
    setReproduce({ modo: "programa", fotos });
  }

  const t = datos?.totales;
  return (
    <div className="hist">
      <header className="hist-cabeza">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="hist-logo" src={LOGO} alt="Conectando Corazones con propósito" />
        <div className="hist-acciones">
          <button type="button" className="btn hist-btn-programa" onClick={abrirPrograma} disabled={!datos || abriendo}>
            {abriendo ? <span className="spinner" /> : <Corazon size={15} className="hist-late" />}
            ¿Qué es Conectando Corazones?
          </button>
          <button type="button" className="btn" onClick={descargarPdf} disabled={!datos?.jornadas.length || pdf}>
            {pdf ? <><span className="spinner" /> Armando el PDF…</> : "Descargar PDF del año"}
          </button>
          <button type="button" className="btn btn-primary hist-pulso" onClick={() => setReproduce({ modo: "anio" })} disabled={!datos?.jornadas.length}>
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9-5.5z" fill="currentColor" /></svg>
            Ver el año completo
          </button>
        </div>
      </header>

      <div className="hist-filtros">
        <label className="hist-anio">Año
          <select value={anio} onChange={(e) => { setMes(0); setAnio(Number(e.target.value)); }}>
            {[anioActual, anioActual - 1, anioActual - 2].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <div className="hist-meses" role="group" aria-label="Mes">
          <button type="button" aria-pressed={mes === 0} onClick={() => crossfade(() => setMes(0))}>Todo el año</button>
          {mesesConJornadas.map((m) => <button key={m} type="button" aria-pressed={mes === m} onClick={() => crossfade(() => setMes(m))}>{MESES[m - 1]}</button>)}
        </div>
        <label className="hist-solo-fotos">Solo jornadas con fotos
          <input type="checkbox" checked={soloFotos} onChange={(e) => setSoloFotos(e.target.checked)} />
        </label>
      </div>

      {error && <div className="modal-error">{error}</div>}

      {!datos && !error && <div className="hist-grid">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton-bar" style={{ height: 250, borderRadius: 18 }} />)}</div>}

      {datos && (
        <>
          <section className="hist-cifras" aria-label={`${anio} en cifras`}>
            <div className="hist-cifra oscura" style={{ "--d": "0ms" }}>
              <span>Jornadas realizadas</span>
              <strong><AnimatedNumber value={t.jornadas} format={entero} /></strong>
              <small>{datos.proximas.length ? `${datos.proximas.length} más programadas` : "Ninguna más programada"}</small>
            </div>
            <div className="hist-cifra" style={{ "--d": "90ms" }}>
              <span>Personas que acompañaron</span>
              <strong><AnimatedNumber value={t.personas} format={entero} /></strong>
              <small>{t.asistencia != null ? `${(t.asistencia * 100).toLocaleString("es-CO", { maximumFractionDigits: 1 })} % de quienes se inscribieron` : "Sin listas de asistencia"}</small>
            </div>
            <div className="hist-cifra" style={{ "--d": "180ms" }}>
              <span>Voces a favor</span>
              <strong><AnimatedNumber value={t.vocesAFavor} format={entero} /></strong>
              <small>{entero(t.vocesEnContra)} en contra · {entero(t.fotos)} foto(s)</small>
            </div>
            {t.frase ? (
              <figure className="hist-cifra frase" style={{ "--d": "270ms" }}>
                <blockquote>“{t.frase.texto}”</blockquote>
                <figcaption>{t.frase.actividad} · {fechaCorta(t.frase.fecha)}</figcaption>
              </figure>
            ) : <div className="hist-cifra" style={{ "--d": "270ms" }}><span>Aún no hay comentarios a favor este año</span></div>}
          </section>

          <section aria-labelledby="hist-jornadas-t" className="hist-seccion">
            <div className="hist-seccion-cabeza">
              <h2 id="hist-jornadas-t">Jornadas de {anio}</h2>
              <span className="count-note">Haz clic en una para verla como presentación</span>
            </div>
            {visibles.length === 0 && <div className="empty">{datos.jornadas.length ? "Ninguna jornada coincide con el filtro." : `Aún no hay jornadas realizadas en ${anio}.`}</div>}
            <div className="hist-grid">
              {visibles.map((j, i) => (
                <button key={j.id} type="button" className="hist-tarjeta" style={{ "--d": `${300 + i * 70}ms` }} onClick={() => setReproduce({ modo: "jornada", id: j.id })}>
                  <span className="hist-tarjeta-foto">
                    {j.fotos[0]
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={urlFoto(j.id, j.fotos[0].id, true)} alt="" loading="lazy" />
                      : <span className="hist-sin-foto"><Corazon size={34} /><small>Aún sin fotos</small></span>}
                    <span className="hist-fecha">{fechaCorta(j.fecha)}</span>
                    <span className="hist-play" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 16 16"><path d="M4 2.5v11l9-5.5z" fill="currentColor" /></svg></span>
                  </span>
                  <span className="hist-tarjeta-texto">
                    <strong>{j.nombre}</strong>
                    <span className="hist-tarjeta-datos">
                      {j.asistentes != null && <span>{entero(j.asistentes)} acompañaron</span>}
                      <span>{j.tonos.aFavor + j.tonos.neutros ? `${j.tonos.aFavor + j.tonos.neutros} comentario(s)` : "Sin comentarios"}</span>
                      {j.calificaciones.total > 0 && <span>{j.calificaciones.promedio.toLocaleString("es-CO", { maximumFractionDigits: 1 })} de 5 ({j.calificaciones.total})</span>}
                      {j.fotos.length > 0 && <span>{j.fotos.length} foto(s)</span>}
                      {j.nova?.puntaje != null && <span className="hist-estrella">★ {j.nova.puntaje}</span>}
                    </span>
                  </span>
                </button>
              ))}
              {!mes && !soloFotos && datos.proximas.map((p, i) => (
                <div key={p.id} className="hist-proxima" style={{ "--d": `${300 + (visibles.length + i) * 70}ms` }}>
                  <span className="hist-proxima-cuando">Próxima · {fechaCorta(p.fecha)}</span>
                  <strong>{p.nombre}</strong>
                  <span>Su historia se arma sola cuando se cargue la asistencia, los comentarios y las fotos.</span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {reproduce && datos && (
        <Reproductor
          datos={datos}
          modo={reproduce.modo}
          jornadaId={reproduce.id}
          fotosPrograma={reproduce.fotos}
          onClose={() => setReproduce(null)}
        />
      )}
    </div>
  );
}
