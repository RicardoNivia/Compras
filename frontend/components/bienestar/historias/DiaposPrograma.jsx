"use client";

import { urlFoto } from "@/lib/api";
import { Corazon, LOGO } from "@/components/bienestar/historias/comun";
import { PROGRAMA as P } from "@/components/bienestar/historias/programa";

// Diapositivas de "¿Qué es Conectando Corazones?": el programa contado con el documento y fotos al azar de las
// jornadas. Se pintan dentro del mismo Reproductor de Historias (escenario 1280×720). Sin dinero ni cifras.

export const DIAPOS_PROGRAMA = [
  { tipo: "prog-portada", dur: 9000 },
  { tipo: "prog-que", dur: 12000 },
  { tipo: "prog-mvv", dur: 14000 },
  { tipo: "prog-valores", dur: 13000 },
  { tipo: "prog-componentes", dur: 13000 },
  { tipo: "prog-camino", dur: 12000 },
  { tipo: "prog-cierre", dur: 11000 },
];

// fotos: [{ actividadId, id }] ya barajadas. Cada diapositiva toma las suyas por posición.
const src = (f, mini) => (f ? urlFoto(f.actividadId, f.id, mini) : null);

function Flotando({ n = 8 }) {
  return Array.from({ length: n }, (_, i) => (
    <Corazon key={i} size={14 + (i % 3) * 8} className="hist-flota" style={{ left: `${5 + i * (90 / n)}%`, animationDuration: `${6 + (i % 3) * 1.7}s`, animationDelay: `${1 + i * 0.55}s` }} />
  ));
}

function Fondo({ foto }) {
  return foto
    // eslint-disable-next-line @next/next/no-img-element
    ? <img className="hd-fondo hd-kenburns" src={src(foto)} alt="" />
    : <div className="hd-fondo hd-fondo-vacio"><Corazon size={260} className="hd-corazon-grande" /></div>;
}

export function DiapoPrograma({ tipo, fotos }) {
  const f = (i) => (fotos.length ? fotos[i % fotos.length] : null);

  if (tipo === "prog-portada") {
    return (
      <div className="hd hd-portada">
        <Fondo foto={f(0)} />
        <div className="hd-velo" />
        <div className="hd-cortina" />
        <Flotando />
        <div className="hd-logo-pastilla">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO} alt="Conectando Corazones" />
        </div>
        <div className="hd-portada-texto">
          <span className="hd-chip">{P.alianza}</span>
          <h1 className="hd-titulo">
            {P.titulo.split(/\s+/).map((p, i) => <span key={i} className="hd-palabra"><span style={{ animationDelay: `${1.2 + i * 0.13}s` }}>{p}</span></span>)}
          </h1>
          <div className="hd-raya" />
          <p className="hd-bajada">«{P.lema}»</p>
        </div>
      </div>
    );
  }

  if (tipo === "prog-que") {
    return (
      <div className="hd hd-oscura pg-que">
        <div className="hd-orbita uno" /><div className="hd-orbita dos" />
        <div className="pg-que-txt">
          <span className="hd-kicker">¿Qué es Conectando Corazones?</span>
          <h2 className="pg-h2">{P.queEs.titulo}</h2>
          <p className="pg-p">{P.queEs.texto}</p>
          <div className="pg-con">
            <span className="pg-con-titulo">Unimos a los colaboradores con</span>
            {P.queEs.con.map((c, i) => <span key={c} className="pg-con-chip" style={{ animationDelay: `${2.2 + i * 0.3}s` }}><Corazon size={16} /> {c}</span>)}
          </div>
        </div>
        <div className="pg-fotos-dos">
          {[1, 2].map((k, i) => {
            const foto = f(k);
            return (
              <figure key={k} className={`pg-polaroid ${i ? "b" : "a"}`} style={{ animationDelay: `${0.8 + i * 0.5}s` }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {foto ? <img src={src(foto, true)} alt="" /> : <span className="pg-polaroid-vacia"><Corazon size={60} /></span>}
              </figure>
            );
          })}
        </div>
      </div>
    );
  }

  if (tipo === "prog-mvv") {
    return (
      <div className="hd hd-oscura pg-mvv">
        <div className="hd-halo" aria-hidden="true" />
        <span className="hd-kicker pg-centro">Lo que nos guía</span>
        <h2 className="pg-h2 pg-centro">Propósito, misión y visión</h2>
        <div className="pg-mvv-cartas">
          {P.mvv.map((m, i) => (
            <article key={m.k} className={`pg-carta c${i}`} style={{ animationDelay: `${0.9 + i * 0.45}s` }}>
              <span className="pg-carta-icono"><Corazon size={26} /></span>
              <h3>{m.k}</h3>
              <p>{m.texto}</p>
            </article>
          ))}
        </div>
      </div>
    );
  }

  if (tipo === "prog-valores") {
    return (
      <div className="hd hd-clara pg-valores">
        <span className="hd-comilla" aria-hidden="true">♥</span>
        <div className="pg-valores-cabeza">
          <span className="hd-kicker pg-kicker-rosa">Valores que promueve</span>
          <h2 className="pg-h2 rosa">Lo que nos mueve</h2>
        </div>
        <div className="pg-valores-grid">
          {P.valores.map((v, i) => (
            <div key={v.k} className="pg-valor" style={{ animationDelay: `${0.8 + i * 0.28}s` }}>
              <span className="pg-valor-num">{i + 1}</span>
              <div>
                <strong>{v.k}</strong>
                <span>{v.texto}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (tipo === "prog-componentes") {
    return (
      <div className="hd hd-oscura pg-comp">
        {f(3) && <><Fondo foto={f(3)} /><div className="pg-velo-fuerte" /></>}
        <span className="hd-kicker pg-centro">Cómo está estructurado</span>
        <h2 className="pg-h2 pg-centro">Cuatro formas de conectar</h2>
        <div className="pg-comp-linea"><i /><span className="pg-comp-viajero"><Corazon size={24} /></span></div>
        <div className="pg-comp-pasos">
          {P.componentes.map((c, i) => (
            <div key={c.k} className="pg-comp-paso" style={{ animationDelay: `${1.3 + i * 0.6}s` }}>
              <span className="pg-comp-num">{i + 1}</span>
              <strong>{c.k}</strong>
              <span>{c.texto}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (tipo === "prog-camino") {
    return (
      <div className="hd hd-oscura pg-camino">
        <div className="pg-camino-txt">
          <span className="hd-kicker">Nuestro camino</span>
          <strong className="pg-desde">{P.camino.desde}</strong>
          <p className="pg-p">{P.camino.texto}</p>
          <div className="pg-hogares">
            {P.camino.hogares.map((h, i) => (
              <div key={h.k} className="pg-hogar" style={{ animationDelay: `${1.4 + i * 0.35}s` }}>
                <span className="pg-hogar-punto"><Corazon size={14} /></span>
                <div><strong>{h.k}</strong><span>{h.texto}</span></div>
              </div>
            ))}
          </div>
        </div>
        <div className="pg-camino-fotos">
          {[4, 5, 6].map((k, i) => {
            const foto = f(k);
            return (
              <div key={k} className={`pg-camino-foto n${i}`} style={{ animationDelay: `${0.6 + i * 0.35}s` }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {foto ? <img src={src(foto, true)} alt="" /> : <span className="pg-polaroid-vacia"><Corazon size={48} /></span>}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // prog-cierre
  return (
    <div className="hd hd-oscura pg-cierre">
      <div className="pg-cierre-mosaico" aria-hidden="true">
        {[7, 8, 9, 10, 11, 12].map((k, i) => {
          const foto = f(k);
          // eslint-disable-next-line @next/next/no-img-element
          return foto ? <img key={k} src={src(foto, true)} alt="" style={{ animationDelay: `${i * 0.25}s` }} /> : <span key={k} />;
        })}
      </div>
      <div className="pg-velo-fuerte" />
      <div className="hd-halo" aria-hidden="true" />
      <div className="hd-cierre-centro pg-cierre-centro">
        <div className="hd-logo-pastilla estatica">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO} alt="Conectando Corazones" />
        </div>
        <h2>{P.cierre.titulo}</h2>
        <p className="hd-escribe">{P.cierre.frase}</p>
        <span className="pg-firma"><Corazon size={18} className="hist-late" /> Aquí descubrimos el poder de estar presentes</span>
      </div>
      <Flotando n={10} />
    </div>
  );
}
