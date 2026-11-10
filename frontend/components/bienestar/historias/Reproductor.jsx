"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { urlFoto } from "@/lib/api";
import { AnimatedNumber } from "@/components/charts/chartKit";
import { fechaCorta, fechaLarga, Corazon, IconoFoto, LOGO } from "@/components/bienestar/historias/comun";
import { DIAPOS_PROGRAMA, DiapoPrograma } from "@/components/bienestar/historias/DiaposPrograma";

const ANCHO = 1280;
const ALTO = 720;
const SALIDA_MS = 700;
const entero = (v) => Math.round(v || 0).toLocaleString("es-CO");
const recorta = (t, n) => (t && t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t || "");

// Las diapositivas de una jornada. La portada siempre (con foto o con el corazón); las demás solo si hay con qué
// llenarlas: personas (si maneja asistencia), galería (si hay fotos), voces (si hay comentarios a favor) y el cierre.
function diapositivasDe(j, grupo) {
  const lista = [{ tipo: "portada", j, grupo, dur: 8000 }];
  if (j.aplicaParticipantes && j.asistentes) lista.push({ tipo: "personas", j, grupo, dur: 9000 });
  if (j.fotos.length) lista.push({ tipo: "galeria", j, grupo, dur: 12000 });
  if (j.calificaciones.total || j.calificaciones.alCerrar || j.comentarios.length) lista.push({ tipo: "voces", j, grupo, dur: 10000 });
  lista.push({ tipo: "cierre", j, grupo, dur: 9000 });
  return lista;
}

// Reproductor a pantalla completa: pasa solo (cada diapositiva con su tiempo), con flechas, pausa, pantalla completa y
// una transición de entrada/salida entre diapositivas. El escenario mide 1280×720 y se escala para caber en la ventana.
export default function Reproductor({ datos, modo, jornadaId, fotosPrograma = [], onClose }) {
  const [actualId, setActualId] = useState(jornadaId);
  const lista = useMemo(() => {
    if (modo === "programa") return DIAPOS_PROGRAMA.map((d) => ({ ...d, grupo: -2 }));
    if (modo === "anio") return [{ tipo: "anual", grupo: -1, dur: 11000 }, ...datos.jornadas.flatMap((j, i) => diapositivasDe(j, i))];
    const i = datos.jornadas.findIndex((j) => j.id === actualId);
    return diapositivasDe(datos.jornadas[i], i);
  }, [datos, modo, actualId]);

  const [idx, setIdx] = useState(0);
  const [saliente, setSaliente] = useState(null);
  const [pausado, setPausado] = useState(false);
  const [foto, setFoto] = useState(null); // { j, i } foto ampliada dentro de la galería
  const [escala, setEscala] = useState(1);
  const [corazones, setCorazones] = useState([]);
  const raiz = useRef(null);
  const restante = useRef(0);
  const inicio = useRef(0);

  const slide = lista[Math.min(idx, lista.length - 1)];
  const ir = useCallback((nuevo) => {
    if (nuevo < 0 || nuevo >= lista.length || nuevo === idx) return;
    setSaliente(idx);
    setIdx(nuevo);
  }, [idx, lista.length]);
  const siguiente = useCallback(() => {
    if (idx < lista.length - 1) ir(idx + 1);
    else setPausado(true); // la última se queda quieta
  }, [idx, lista.length, ir]);

  useEffect(() => { if (saliente == null) return undefined; const t = setTimeout(() => setSaliente(null), SALIDA_MS); return () => clearTimeout(t); }, [saliente, idx]);

  // Temporizador con pausa: al pausar se guarda lo que faltaba de la diapositiva.
  useEffect(() => { restante.current = slide.dur; }, [idx, lista]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (pausado || foto) return undefined;
    inicio.current = Date.now();
    const t = setTimeout(siguiente, Math.max(0, restante.current));
    return () => { clearTimeout(t); restante.current -= Date.now() - inicio.current; };
  }, [idx, pausado, foto, lista, siguiente]);

  useEffect(() => {
    const medir = () => setEscala(Math.min(window.innerWidth / ANCHO, (window.innerHeight - 76) / ALTO, 1.6));
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, []);

  const pantallaCompleta = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else raiz.current?.requestFullscreen?.().catch(() => {});
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); if (foto) setFoto(null); else if (!document.fullscreenElement) onClose(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); ir(idx + 1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); ir(idx - 1); }
      else if (e.key === " ") { e.preventDefault(); setPausado((p) => !p); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [idx, ir, foto, onClose]);

  useEffect(() => {
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previo; if (document.fullscreenElement) document.exitFullscreen?.(); };
  }, []);

  // Doble clic: un corazón que sube desde donde se hizo clic.
  function latir(e) {
    const r = e.currentTarget.getBoundingClientRect();
    const id = Date.now();
    setCorazones((l) => [...l, { id, x: (e.clientX - r.left) / escala, y: (e.clientY - r.top) / escala }]);
    setTimeout(() => setCorazones((l) => l.filter((c) => c.id !== id)), 1400);
  }

  const delGrupo = lista.map((s, i) => ({ s, i })).filter(({ s }) => s.grupo === slide.grupo);
  const total = datos.jornadas.length;
  const sigJornada = modo === "jornada" ? datos.jornadas[slide.grupo + 1] : null;

  const pintar = (s, clave, clase) => (
    <div key={clave} className={`hist-diapo ${clase}`}>
      {s.tipo === "anual" && <DiapoAnual datos={datos} />}
      {s.tipo.startsWith("prog-") && <DiapoPrograma tipo={s.tipo} fotos={fotosPrograma} />}
      {s.tipo === "portada" && <DiapoPortada j={s.j} n={s.grupo + 1} total={total} />}
      {s.tipo === "personas" && <DiapoPersonas j={s.j} />}
      {s.tipo === "galeria" && <DiapoGaleria j={s.j} onFoto={(i) => setFoto({ j: s.j, i })} />}
      {s.tipo === "voces" && <DiapoVoces j={s.j} />}
      {s.tipo === "cierre" && <DiapoCierre j={s.j} siguiente={sigJornada} onSiguiente={() => { setActualId(sigJornada.id); setSaliente(null); setIdx(0); setPausado(false); }} />}
    </div>
  );

  return createPortal(
    <div ref={raiz} className="hist-reproductor" role="dialog" aria-modal="true" aria-label="Historias de Conectando Corazones">
      <div className="hist-escenario-caja">
        <div className={`hist-escenario${slide.tipo === "voces" || slide.tipo === "prog-valores" ? " clara" : ""}`} style={{ width: ANCHO, height: ALTO, transform: `scale(${escala})` }} onDoubleClick={latir}>
          {saliente != null && lista[saliente] && pintar(lista[saliente], `s${saliente}`, "sale")}
          {pintar(slide, `e${idx}-${actualId}`, "entra")}

          <div className="hist-segmentos" aria-hidden="true">
            {delGrupo.map(({ s, i }) => (
              <span key={`${i}-${actualId}`}>
                <i className={i < idx ? "lleno" : i === idx ? "corre" : ""} style={i === idx ? { animationDuration: `${s.dur}ms`, animationPlayState: pausado || foto ? "paused" : "running" } : undefined} />
              </span>
            ))}
          </div>
          <div className="hist-rotulo">
            <span><Corazon size={16} className="hist-late" /> Conectando Corazones · Historias</span>
            <span>{slide.grupo >= 0 ? `Jornada ${slide.grupo + 1} de ${total} · ${datos.anio}` : slide.grupo === -2 ? "¿Qué es Conectando Corazones?" : `${datos.anio} en un minuto`}</span>
          </div>

          <button type="button" className="hist-zona prev" onClick={() => ir(idx - 1)} aria-label="Diapositiva anterior" />
          <button type="button" className="hist-zona next" onClick={() => ir(idx + 1)} aria-label="Diapositiva siguiente" />

          {corazones.map((c) => <Corazon key={c.id} size={90} className="hist-corazon-toque" style={{ left: c.x - 45, top: c.y - 42 }} />)}
        </div>
      </div>

      <div className="hist-controles">
        <button type="button" className="hist-ctrl" onClick={() => ir(idx - 1)} disabled={idx === 0} aria-label="Anterior">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 3 5 8l5 5" /></svg>
        </button>
        <button type="button" className="hist-ctrl claro" onClick={() => setPausado((p) => !p)} aria-label={pausado ? "Reproducir" : "Pausar"}>
          {pausado
            ? <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9-5.5z" fill="currentColor" /></svg>
            : <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5h3v11H4zM9 2.5h3v11H9z" fill="currentColor" /></svg>}
        </button>
        <button type="button" className="hist-ctrl" onClick={() => ir(idx + 1)} disabled={idx === lista.length - 1} aria-label="Siguiente">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 3 5 5-5 5" /></svg>
        </button>
        <span className="hist-ctrl-texto">{idx + 1} de {lista.length} · flechas para moverte, espacio para pausar, doble clic para un corazón</span>
        <button type="button" className="hist-ctrl ancho" onClick={pantallaCompleta}>Pantalla completa</button>
        <button type="button" className="hist-ctrl" onClick={onClose} aria-label="Cerrar">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M3 3l10 10M13 3 3 13" /></svg>
        </button>
      </div>

      {foto && (
        <div className="hist-visor" onMouseDown={(e) => { if (e.target === e.currentTarget) setFoto(null); }}>
          <button type="button" className="fotos-cerrar" onClick={() => setFoto(null)} aria-label="Cerrar foto">✕</button>
          <button type="button" className="fotos-nav prev" onClick={() => setFoto((f) => ({ ...f, i: Math.max(0, f.i - 1) }))} disabled={foto.i === 0} aria-label="Foto anterior">‹</button>
          <figure>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={urlFoto(foto.j.id, foto.j.fotos[foto.i].id)} alt={foto.j.fotos[foto.i].descripcion || `Foto ${foto.i + 1} de ${foto.j.nombre}`} />
            <figcaption>{foto.j.fotos[foto.i].descripcion || foto.j.nombre} · {foto.i + 1} de {foto.j.fotos.length}</figcaption>
          </figure>
          <button type="button" className="fotos-nav next" onClick={() => setFoto((f) => ({ ...f, i: Math.min(f.j.fotos.length - 1, f.i + 1) }))} disabled={foto.i === foto.j.fotos.length - 1} aria-label="Foto siguiente">›</button>
        </div>
      )}
    </div>,
    document.body,
  );
}

function CorazonesFlotando({ n = 9 }) {
  return Array.from({ length: n }, (_, i) => (
    <Corazon key={i} size={16 + (i % 3) * 8} className="hist-flota" style={{ left: `${6 + i * (88 / n)}%`, animationDuration: `${6 + (i % 3) * 1.7}s`, animationDelay: `${1.2 + i * 0.6}s` }} />
  ));
}

function DiapoPortada({ j }) {
  const foto = j.fotos[0];
  return (
    <div className="hd hd-portada">
      {foto
        // eslint-disable-next-line @next/next/no-img-element
        ? <img className="hd-fondo hd-kenburns" src={urlFoto(j.id, foto.id)} alt="" />
        : <div className="hd-fondo hd-fondo-vacio"><Corazon size={260} className="hd-corazon-grande" /></div>}
      <div className="hd-velo" />
      <div className="hd-cortina" />
      <CorazonesFlotando />
      <div className="hd-logo-pastilla">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={LOGO} alt="Conectando Corazones" />
      </div>
      <div className="hd-portada-texto">
        <span className="hd-chip">{fechaLarga(j.fecha)}{j.fechaFin && j.fechaFin !== j.fecha ? ` al ${fechaCorta(j.fechaFin)}` : ""}</span>
        <h1 className="hd-titulo">
          {j.nombre.split(/\s+/).map((p, i) => <span key={i} className="hd-palabra"><span style={{ animationDelay: `${1.2 + i * 0.12}s` }}>{p}</span></span>)}
        </h1>
        <div className="hd-raya" />
        {j.descripcion && <p className="hd-bajada">{recorta(j.descripcion, 150)}</p>}
      </div>
    </div>
  );
}

function DiapoPersonas({ j }) {
  const max = Math.max(1, ...j.porArea.map((a) => a.asistieron));
  const puntos = Math.min(j.asistentes, 128);
  return (
    <div className="hd hd-oscura hd-personas">
      <div className="hd-orbita uno" /><div className="hd-orbita dos" />
      <div className="hd-personas-izq">
        <span className="hd-kicker">Ese día fuimos</span>
        <strong className="hd-numero-gigante"><AnimatedNumber value={j.asistentes} format={entero} duration={1800} /></strong>
        <span className="hd-subtitulo">personas de Sincosoft acompañando a la Fundación</span>
        {j.asistencia != null && (
          <span className="hd-fila-chip"><b className="hd-chip magenta">{(j.asistencia * 100).toLocaleString("es-CO", { maximumFractionDigits: 1 })} %</b> de las {entero(j.inscritos)} que se inscribieron llegaron</span>
        )}
        <div className="hd-puntos" role="img" aria-label={`${j.asistentes} personas`}>
          {Array.from({ length: puntos }, (_, i) => <i key={i} className={i % 7 === 3 ? "magenta" : ""} style={{ animationDelay: `${0.5 + i * (1.6 / puntos)}s` }} />)}
        </div>
      </div>
      {j.porArea.length > 0 && (
        <div className="hd-personas-der">
          <h2>Por área</h2>
          {j.porArea.map((a, i) => (
            <div key={a.area} className="hd-barra-fila" style={{ animationDelay: `${1.2 + i * 0.1}s` }}>
              <span>{a.area}</span>
              <span className="hd-barra"><i style={{ width: `${(a.asistieron / max) * 100}%`, animationDelay: `${1.35 + i * 0.1}s` }} className={i === 0 ? "magenta" : ""} /></span>
              <b>{a.asistieron}</b>
            </div>
          ))}
          <p className="hd-nota">Contamos a quienes acompañaron, no a los beneficiarios.</p>
        </div>
      )}
    </div>
  );
}

const ENTRADAS = ["izq", "arr", "der", "aba", "der"];

function DiapoGaleria({ j, onFoto }) {
  const fotos = j.fotos.slice(0, 5);
  const extra = j.fotos.length - fotos.length;
  const destacada = j.fotos.find((f) => f.descripcion);
  return (
    <div className="hd hd-oscura hd-galeria">
      <div className={`hd-mosaico n${fotos.length}`}>
        {fotos.map((f, i) => (
          <button key={f.id} type="button" className={`hd-pieza ${ENTRADAS[i]}`} style={{ animationDelay: `${0.3 + i * 0.18}s` }} onClick={() => onFoto(i)} aria-label={`Ampliar foto ${i + 1}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={urlFoto(j.id, f.id, i > 0 && fotos.length > 2)} alt={f.descripcion || ""} style={{ animationDelay: `${1.2 + i * 0.2}s`, animationDuration: `${10 + i * 2}s` }} />
            {i === fotos.length - 1 && extra > 0 && <span className="hd-mas">+{extra}</span>}
          </button>
        ))}
      </div>
      {destacada && (
        <figure className="hd-polaroid">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={urlFoto(j.id, destacada.id, true)} alt="" />
          <figcaption>{recorta(destacada.descripcion, 70)}</figcaption>
        </figure>
      )}
      <div className="hd-flash" aria-hidden="true" />
      <span className="hd-pie-galeria"><IconoFoto size={16} /> {j.fotos.length} foto(s) · haz clic en una para ampliarla</span>
    </div>
  );
}

// Calificaciones y comentarios de la jornada: el promedio de los participantes con su reparto por estrellas (o la
// calificación al cerrar, si solo hay esa) y los 4 mejores comentarios a favor.
function DiapoVoces({ j }) {
  const c = j.calificaciones;
  const voces = j.comentarios.slice(0, 4);
  const maxDist = Math.max(1, ...c.distribucion);
  const base = 1;
  return (
    <div className="hd hd-clara hd-voces">
      <span className="hd-comilla" aria-hidden="true">“</span>
      <div className="hd-voces-izq">
        <h2>Calificaciones y comentarios</h2>
        {c.total > 0 ? (
          <div className="hd-calif">
            <div className="hd-calif-cabeza">
              <strong className="hd-calif-numero">{c.promedio.toLocaleString("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</strong>
              <span className="hd-calif-estrellas" role="img" aria-label={`${c.promedio.toFixed(1)} de 5`}>
                {[0, 1, 2, 3, 4].map((i) => (
                  <span key={i} className="hd-calif-estrella" style={{ animationDelay: `${0.7 + i * 0.15}s` }}>
                    <Estrella />
                    <span className="hd-calif-relleno" style={{ width: `${Math.max(0, Math.min(1, c.promedio - i)) * 100}%` }}><Estrella /></span>
                  </span>
                ))}
              </span>
            </div>
            <span className="hd-calif-nota">de 5 · {entero(c.total)} calificación(es) de quienes fueron{c.alCerrar ? ` · al cerrar: ${c.alCerrar} de 5` : ""}</span>
            <div className="hd-calif-reparto">
              {[5, 4, 3, 2, 1].map((n, i) => (
                <div key={n} className="hd-calif-fila" style={{ animationDelay: `${1.1 + i * 0.08}s` }}>
                  <span>{n}★</span>
                  <span className="hd-calif-barra"><i style={{ width: `${(c.distribucion[n - 1] / maxDist) * 100}%`, animationDelay: `${1.25 + i * 0.08}s` }} /></span>
                  <b>{entero(c.distribucion[n - 1])}</b>
                </div>
              ))}
            </div>
          </div>
        ) : c.alCerrar ? (
          <p>Al cerrar la jornada se calificó con <b>{c.alCerrar} de 5</b>. Los participantes no dejaron calificación.</p>
        ) : (
          <p>Los participantes no dejaron calificación; estos son sus mejores comentarios, sin nombres.</p>
        )}
        <div className="hd-voces-chips">
          <span className="hd-chip-blanco verde"><Manito /> {entero(j.tonos.aFavor)} a favor</span>
          <span className="hd-chip-blanco"><Manito lado /> {entero(j.tonos.neutros)} neutros</span>
          <span className="hd-chip-blanco">{entero(j.tonos.enContra)} en contra</span>
        </div>
      </div>
      <div className="hd-voces-der">
        {voces.length === 0 && <p className="hd-sin-comentarios">No dejaron comentarios a favor en esta jornada.</p>}
        {voces.map((v, i) => (
          <figure key={i} className={`hd-voz ${v.tono}`} style={{ "--giro": `${[-1.2, 1, -0.6, 0.8][i]}deg`, animationDelay: `${base + i * 0.7}s, ${base + 1.2 + i}s` }}>
            <span className="hd-manito" style={{ animationDelay: `${base + 0.35 + i * 0.7}s` }}><Manito size={22} /></span>
            <div>
              <blockquote style={{ animationDelay: `${base + 0.2 + i * 0.7}s` }}>“{recorta(v.texto, 120)}”</blockquote>
              <figcaption>Voluntariado Sincosoft{v.calificacion ? ` · ${v.calificacion} de 5` : ""}</figcaption>
            </div>
          </figure>
        ))}
      </div>
    </div>
  );
}

function Estrella() {
  return <svg width="40" height="40" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 3 6.6 7.2.7-5.4 4.9 1.6 7.1L12 17.6 5.6 21.3l1.6-7.1L1.8 9.3 9 8.6z" fill="currentColor" /></svg>;
}

// La manito de Nova: arriba = a favor; de lado = neutro.
function Manito({ size = 16, lado = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={lado ? { transform: "rotate(-90deg)" } : undefined} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 10v11M15 5.9 14 10h5.8a2 2 0 0 1 2 2.3l-1.4 7A2 2 0 0 1 18.4 21H7V10l4-8a3 3 0 0 1 4 3.9z" />
    </svg>
  );
}

function DiapoCierre({ j, siguiente, onSiguiente }) {
  const p = j.nova?.puntaje;
  return (
    <div className="hd hd-oscura hd-cierre">
      <div className="hd-halo" aria-hidden="true" />
      {Array.from({ length: 12 }, (_, i) => <span key={i} className="hd-chispa" style={{ left: `${[8, 15, 22, 30, 70, 78, 85, 92, 12, 88, 40, 60][i]}%`, top: `${[20, 70, 35, 85, 18, 60, 30, 78, 48, 48, 12, 88][i]}%`, animationDelay: `${i * 0.3}s` }} />)}
      <div className="hd-cierre-centro">
        <span className="hd-chip suave">Lo que vio Nova</span>
        {p != null ? (
          <div className="hd-estrellas" role="img" aria-label={`${p} de 5 estrellas`}>
            {[0, 1, 2, 3, 4].map((i) => (
              <span key={i} className={i < p ? "llena" : ""} style={{ animationDelay: `${0.6 + i * 0.22}s` }}>
                <svg width="58" height="58" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 3 6.6 7.2.7-5.4 4.9 1.6 7.1L12 17.6 5.6 21.3l1.6-7.1L1.8 9.3 9 8.6z" fill="currentColor" /></svg>
              </span>
            ))}
          </div>
        ) : <span className="hd-sin-datos">Sin datos para calificar</span>}
        <h2>{j.nova?.titulo || j.nombre}</h2>
        {/* La frase de Nova va completa. Es emocional: el análisis técnico (presupuesto, gasto, inventario) nunca sale aquí. */}
        {j.nova?.frase && <p className="hd-escribe">{j.nova.frase}</p>}
      </div>
      {siguiente && (
        <button type="button" className="hd-siguiente" onClick={onSiguiente}>
          <span className="hd-siguiente-icono"><Corazon size={24} /></span>
          <span className="hd-siguiente-texto">
            <small>Sigue · {fechaCorta(siguiente.fecha)}</small>
            <strong>{siguiente.nombre}</strong>
          </span>
          <span className="hd-empuja" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 8h11M9 3.5 13.5 8 9 12.5" /></svg></span>
        </button>
      )}
    </div>
  );
}

function DiapoAnual({ datos }) {
  const t = datos.totales;
  const diaDelAnio = (iso) => {
    const [y, m, d] = iso.split("-").map(Number);
    return (Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / (365 * 864e5);
  };
  // Cada etiqueta va arriba o abajo de la línea, en el primer nivel donde no pise a la anterior de ese nivel.
  const NIVELES = ["arriba", "abajo", "arriba dos", "abajo dos"];
  const ultimo = NIVELES.map(() => -100);
  const hitos = datos.jornadas.map((j) => {
    const x = diaDelAnio(j.fecha) * 100;
    let n = NIVELES.findIndex((_, k) => x - ultimo[k] >= 12);
    if (n < 0) n = ultimo.indexOf(Math.min(...ultimo));
    ultimo[n] = x;
    return { j, x, nivel: NIVELES[n] };
  });
  return (
    <div className="hd hd-oscura hd-anual">
      <div className="hd-anual-cabeza">
        <div className="hd-logo-pastilla estatica">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO} alt="Conectando Corazones" />
        </div>
        <h1>{datos.anio} en un minuto</h1>
      </div>
      <div className="hd-anual-cifras">
        <div style={{ animationDelay: ".4s" }}><strong><AnimatedNumber value={t.jornadas} format={entero} duration={1500} /></strong><span>jornadas realizadas</span></div>
        <div style={{ animationDelay: ".55s" }}><strong><AnimatedNumber value={t.personas} format={entero} duration={2200} /></strong><span>personas acompañaron</span></div>
        <div style={{ animationDelay: ".7s" }}><strong className="verde"><AnimatedNumber value={t.vocesAFavor} format={entero} duration={1800} /></strong><span>voces a favor · {entero(t.vocesEnContra)} en contra</span></div>
        {t.areaTop
          ? <div className="magenta" style={{ animationDelay: ".85s" }}><span>Área que más acompañó</span><strong className="pequena">{t.areaTop.area}</strong><span>{entero(t.areaTop.asistieron)} personas en el año</span></div>
          : <div style={{ animationDelay: ".85s" }}><strong className="pequena">{entero(t.fotos)}</strong><span>fotos de las jornadas</span></div>}
      </div>
      <div className="hd-linea-anio">
        <div className="hd-linea-traza" />
        <span className="hd-viajero"><Corazon size={22} /></span>
        {hitos.map(({ j, x, nivel }) => {
          const demora = 1.2 + (x / 100) * 3;
          return (
            <span key={j.id}>
              <i className="hd-hito" style={{ left: `${x}%`, animationDelay: `${demora}s` }} />
              <span className={`hd-hito-texto ${nivel}`} style={{ left: `${x}%`, animationDelay: `${demora + 0.15}s` }}><b>{fechaCorta(j.fecha)}</b>{recorta(j.nombre, 28)}</span>
            </span>
          );
        })}
      </div>
      {t.frase && <blockquote className="hd-anual-frase">“{recorta(t.frase.texto, 130)}”</blockquote>}
    </div>
  );
}
