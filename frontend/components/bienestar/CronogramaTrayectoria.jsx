"use client";

import { useEffect, useMemo, useState } from "react";
import { MESES } from "@/lib/format";
import { AnimatedNumber } from "@/components/charts/chartKit";
import { ESTADOS_ACTIVIDAD, estadoActividad, rangoHumano, diasDeActividad } from "@/components/bienestar/actividadesUi";
import ComparaPresupuesto from "@/components/bienestar/ComparaPresupuesto";

// Niveles de las etiquetas, alternando arriba y abajo de la línea del año y de más cerca a más lejos (píxeles).
const NIVELES = [-62, 62, -118, 118, -174, 174, -230, 230];
const CORTE_AL_REVES = 85;
const SEPARACION = 14; // % del año que ocupa una etiqueta, para que no pise a la siguiente de su nivel
const MES_CORTO = MESES.map((m) => m.slice(0, 3));
const entero = (v) => Math.round(v).toLocaleString("es-CO");

const pad = (n) => String(n).padStart(2, "0");
const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const diaDelAnio = (iso, anio) => (Date.UTC(anio, Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) - Date.UTC(anio, 0, 1)) / 86400000;
const diasEntre = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

// Cada actividad en un punto del año, con su etiqueta en el primer nivel libre.
function ubicar(actividades, anio) {
  const total = (Date.UTC(anio + 1, 0, 1) - Date.UTC(anio, 0, 1)) / 86400000;
  const ocupado = NIVELES.map(() => []); // por nivel, los tramos [desde, hasta] que ya tienen etiqueta
  return actividades.map((a) => {
    const x = (diaDelAnio(a.fecha, anio) / total) * 100;
    const fin = a.fechaFin && a.fechaFin.startsWith(`${anio}-`) ? (diaDelAnio(a.fechaFin, anio) / total) * 100 : x;
    // Del 85 % del año en adelante la etiqueta se abre hacia la izquierda de su punto.
    const tramo = x > CORTE_AL_REVES ? [x - SEPARACION, x] : [x, x + SEPARACION];
    const libre = (n) => !ocupado[n].some(([d, h]) => tramo[0] < h && d < tramo[1]);
    let nivel = NIVELES.findIndex((_, n) => libre(n));
    if (nivel < 0) nivel = ocupado.reduce((mejor, l, n) => (l.length < ocupado[mejor].length ? n : mejor), 0);
    ocupado[nivel].push(tramo);
    return { a, x, fin, nivel };
  });
}

// Las dos flechitas de expandir y de contraer.
function IconExpandir() {
  return <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9.500 2H14v4.500M14 2 9 7M6.500 14H2V9.500M2 14l5-5" /></svg>;
}
function IconContraer() {
  return <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 6.500H9.500V2M9.500 6.500 14.500 1.500M2 9.500h4.500V14M6.500 9.500l-5 5" /></svg>;
}

// La vista más visual del cronograma: el año como una línea de metro que se dibuja al entrar. Cada actividad es una
// parada (más grande entre más personas fueron) y la línea cambia de color según el estado de cada una. Al hacer clic
// en una actividad se abre su detalle.
export default function CronogramaTrayectoria({ anio, linea, actividades, onElegir, onMes }) {
  const [filtro, setFiltro] = useState(null); // estado resaltado desde la leyenda
  const [completa, setCompleta] = useState(false); // ver a pantalla completa
  useEffect(() => {
    if (!completa) return undefined;
    const onKey = (e) => { if (e.key === "Escape") setCompleta(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [completa]);
  const hoy = hoyISO();
  const esEsteAnio = hoy.startsWith(`${anio}-`);

  const conFecha = useMemo(() => actividades.filter((a) => a.fecha).sort((x, y) => x.fecha.localeCompare(y.fecha)), [actividades]);
  const sinFecha = useMemo(() => actividades.filter((a) => !a.fecha), [actividades]);
  const nodos = useMemo(() => ubicar(conFecha, anio), [conFecha, anio]);
  const xHoy = esEsteAnio ? (diaDelAnio(hoy, anio) / ((Date.UTC(anio + 1, 0, 1) - Date.UTC(anio, 0, 1)) / 86400000)) * 100 : hoy > `${anio}-12-31` ? 100 : 0;

  const realizadas = conFecha.filter((a) => a.estado === "ejecutada" || a.estado === "cerrada").length;
  const pctRecorrido = conFecha.length ? realizadas / conFecha.length : 0;
  const proxima = conFecha.find((a) => (a.fechaFin || a.fecha) >= hoy && (a.estado === "creada" || a.estado === "programada"));
  const diasProxima = proxima ? diasEntre(hoy, proxima.fecha) : null;
  // Programados contra asistentes: solo las actividades que tienen los dos datos (la misma regla del Resumen).
  const conAsistencia = conFecha.filter((a) => a.inscritos && a.asistentes != null);
  const programados = conAsistencia.reduce((s, a) => s + a.inscritos, 0);
  const asistieron = conAsistencia.reduce((s, a) => s + a.asistentes, 0);
  const presupuestado = conFecha.reduce((s, a) => s + (a.presupuesto || 0), 0);
  const gastado = conFecha.reduce((s, a) => s + (a.gastado || 0), 0);
  const gastoSinPresupuesto = conFecha.filter((a) => !a.presupuesto).reduce((s, a) => s + (a.gastado || 0), 0);
  const conteo = Object.fromEntries(ESTADOS_ACTIVIDAD.map((e) => [e.value, conFecha.filter((a) => a.estado === e.value).length]));
  const R = 22;
  // La pista crece solo hasta el nivel más lejano que se usó, para que un año con pocas actividades no quede vacío.
  const alcance = nodos.length ? Math.max(...nodos.map((n) => Math.abs(NIVELES[n.nivel]))) : 62;
  const alto = 2 * alcance + 110;

  return (
    <section className={`tray${linea === "Fundación" ? " tray-fundacion" : ""}${completa ? " pantalla-completa" : ""}`} aria-label={`Trayectoria de ${anio}`}>
      <div className="tray-cifras">
        <div className="tray-cifra tray-progreso">
          <svg viewBox="0 0 56 56" width="56" height="56" aria-hidden="true">
            <circle cx="28" cy="28" r={R} className="tray-anillo-fondo" />
            <circle cx="28" cy="28" r={R} className="tray-anillo" pathLength="1" strokeDasharray="1" style={{ "--fin": 1 - pctRecorrido }} transform="rotate(-90 28 28)" />
          </svg>
          <div>
            <span>Recorrido del año</span>
            <strong><AnimatedNumber value={Math.round(pctRecorrido * 100)} format={(v) => `${Math.round(v)} %`} /></strong>
            <small>{realizadas} de {conFecha.length} realizadas</small>
          </div>
        </div>
        <div className="tray-cifra">
          <span>Próxima parada</span>
          {proxima ? (
            <>
              <button type="button" className="tray-proxima" onClick={() => onElegir(proxima)}>{proxima.nombre}</button>
              <small>{diasProxima <= 0 ? "En curso o es hoy" : diasProxima === 1 ? "Mañana" : `En ${diasProxima} días`} · {rangoHumano(proxima)}</small>
            </>
          ) : <strong className="tray-sin">Nada programado</strong>}
        </div>
        <div className="tray-cifra">
          <span>Programados y asistentes</span>
          <div className="compara-presu">
            <dl>
              <div><dt>Programados</dt><dd>{entero(programados)}</dd></div>
              <div><dt>Asistieron</dt><dd>{entero(asistieron)}</dd></div>
              <div className="diferencia disponible"><dt>Asistencia</dt><dd>{programados ? `${(Math.round((asistieron / programados) * 1000) / 10).toString().replace(".", ",")} %` : "—"}</dd></div>
            </dl>
          </div>
        </div>
        <div className="tray-cifra">
          <span>Presupuesto y gasto</span>
          <ComparaPresupuesto presupuesto={presupuestado} gastado={gastado} gastoSinPresupuesto={gastoSinPresupuesto} />
        </div>
      </div>

      <div className="tray-barra">
        <div className="tray-leyenda" role="group" aria-label="Resaltar por estado">
          {ESTADOS_ACTIVIDAD.map((e) => (
            <button key={e.value} type="button" aria-pressed={filtro === e.value} className={`tray-filtro tray-c-${e.value}`} onClick={() => setFiltro(filtro === e.value ? null : e.value)}>
              <i aria-hidden="true" /> {e.label} <b>{conteo[e.value]}</b>
            </button>
          ))}
        </div>
        <button type="button" className="tray-expandir" onClick={() => setCompleta((v) => !v)} aria-pressed={completa} title={completa ? "Salir de pantalla completa (Esc)" : "Ver a pantalla completa"}>
          {completa ? <IconContraer /> : <IconExpandir />} {completa ? "Salir" : "Pantalla completa"}
        </button>
      </div>

      <div className="tray-scroll">
        <div className="tray-lienzo">
          <div className="tray-meses">
            {MES_CORTO.map((m, i) => (
              <button key={m} type="button" className={`tray-mes${esEsteAnio && new Date().getMonth() === i ? " actual" : ""}`} onClick={() => onMes(i)} title={`Ver ${MESES[i]} en el calendario`}>{m}</button>
            ))}
          </div>
          <div className="tray-pista" style={{ height: alto }}>
            <div className="tray-recorrido" style={{ "--ancho": `${xHoy}%` }} aria-hidden="true" />
            {esEsteAnio && <div className="tray-hoy" style={{ left: `${xHoy}%` }} aria-hidden="true"><span>Hoy</span></div>}

            <div className="tray-linea" aria-hidden="true">
              {nodos.slice(1).map((n, i) => {
                const p = nodos[i];
                return <span key={n.a.id} style={{ left: `${p.x}%`, width: `${n.x - p.x}%`, "--de": `var(--est-${p.a.estado})`, "--a": `var(--est-${n.a.estado})` }} />;
              })}
            </div>

            {nodos.map(({ a, x, fin, nivel }, i) => {
              const tam = 16 + (Math.min(a.asistentes || 0, 120) / 120) * 18;
              const est = estadoActividad(a.estado);
              const apagada = filtro && filtro !== a.estado;
              const y = NIVELES[nivel];
              return (
                <div key={a.id} className={apagada ? "tray-apagada" : ""}>
                  {fin > x && <span className={`tray-duracion tray-c-${a.estado}`} style={{ left: `${x}%`, width: `${fin - x}%` }} aria-hidden="true" />}
                  <button
                    type="button"
                    className={`tray-punto tray-c-${a.estado}${x > CORTE_AL_REVES ? " al-reves" : ""}${proxima?.id === a.id ? " proxima" : ""}`}
                    style={{ left: `${x}%`, "--tam": `${tam}px`, "--y": `${y}px`, "--tallo": `${Math.abs(y)}px`, "--d": `${(x / 100) * 1100 + 120}ms` }}
                    onClick={() => onElegir(a)}
                    aria-label={`${a.nombre}, ${rangoHumano(a)}, ${est.label}. Ver detalle`}
                  >
                    <span className={`tray-tallo ${y < 0 ? "arriba" : "abajo"}`} aria-hidden="true" />
                    <i aria-hidden="true">{a.asistentes ? <em>{entero(a.asistentes)}</em> : null}</i>
                    <span className="tray-etiqueta">
                      {a.puntajeNova != null && <span className="nova-puntaje" title={`Nova la calificó con ${a.puntajeNova} de 5`}>★ {a.puntajeNova}</span>}
                      <small>{Number(a.fecha.slice(8, 10))} {MES_CORTO[Number(a.fecha.slice(5, 7)) - 1]}{a.fechaFin ? ` · ${diasDeActividad(a)} días` : ""}</small>
                      <b>{a.nombre}</b>
                    </span>
                  </button>
                </div>
              );
            })}
            {nodos.length === 0 && <p className="tray-vacio">Aún no hay actividades con fecha en {anio}.</p>}
          </div>
        </div>
      </div>

      {sinFecha.length > 0 && (
        <div className="tray-por-planear">
          <span>Por planear</span>
          {sinFecha.map((a) => <button key={a.id} type="button" onClick={() => onElegir(a)}>{a.nombre}</button>)}
        </div>
      )}
    </section>
  );
}
