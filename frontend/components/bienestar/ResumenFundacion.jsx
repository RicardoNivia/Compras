"use client";

import { useEffect, useState } from "react";
import { MESES, fmtCOP } from "@/lib/format";
import { fetchResumenBienestarApi, explicarIndicadorBienestarApi } from "@/lib/api";
import KpiExplain from "@/components/KpiExplain";
import { AnimatedNumber } from "@/components/charts/chartKit";
import ComboChartSvg from "@/components/charts/ComboChartSvg";
import HBarChartSvg from "@/components/charts/HBarChartSvg";
import AnalisisNova from "@/components/bienestar/AnalisisNova";
import ComentariosDestacados from "@/components/bienestar/ComentariosDestacados";
import ComprasSinActividad from "@/components/bienestar/ComprasSinActividad";
import ComparaPresupuesto from "@/components/bienestar/ComparaPresupuesto";
import { EsqueletoResumen } from "@/components/bienestar/Esqueletos";
import ResumenDelMes from "@/components/bienestar/ResumenDelMes";
import { estadoActividad, rangoFechas } from "@/components/bienestar/actividadesUi";
import { crossfade } from "@/lib/crossfade";

const pct = (v) => (v == null ? "—" : `${(Math.round(v * 1000) / 10).toString().replace(".", ",")} %`);
const entero = (v) => Math.round(v).toLocaleString("es-CO");
const MES_CORTO = MESES.map((m) => m.slice(0, 3));
const JORNADAS_VISIBLES = 6;

// Resumen de Fundación (logo en public/bienestar/conectando-corazones.png). No es el tablero de las actividades internas: cuenta el acompañamiento de los
// colaboradores a la Fundación (a quiénes atiende, cuántas jornadas, cuántas personas fueron, qué áreas se suman) sin
// dejar de lado la asistencia y lo que cuesta. Las cifras son las de la plataforma (/api/actividades/resumen, las mismas
// de Bienestar); de los beneficiarios no hay datos registrados, así que no se muestra ninguna cifra sobre ellos.
export default function ResumenFundacion({ anio, anios = [], onAnio, puedeEditar, accion, onAbrirActividad, onAbrirComentario, onVerActividades }) {
  const ahora = new Date();
  const [vista, setVista] = useState("anual");
  const [mes, setMes] = useState(ahora.getFullYear() === anio ? ahora.getMonth() + 1 : 1);
  const [resumen, setResumen] = useState(null);
  const [recarga, setRecarga] = useState(0);
  const [error, setError] = useState("");
  const [actualizando, setActualizando] = useState(false);

  useEffect(() => {
    let vigente = true;
    setError("");
    setActualizando(true);
    fetchResumenBienestarApi(anio, "Fundación", vista === "mensual" ? mes : null)
      .then((r) => { if (vigente) setResumen(r.resumen); })
      .catch((e) => { if (vigente) setError(e.message || "No se pudo cargar el resumen."); })
      .finally(() => { if (vigente) setActualizando(false); });
    return () => { vigente = false; };
  }, [recarga, anio, vista, mes]);

  const periodo = vista === "mensual" ? `${MESES[mes - 1].toLowerCase()} de ${anio}` : String(anio);

  const cabecera = (
    <header className="fundacion-hero">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="fundacion-hero-logo" src="/bienestar/conectando-corazones.png" alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} />
      <div className="fundacion-hero-controles">
        <div className="resumen-periodo">
          <div className="dash-tabs" role="tablist" aria-label="Periodo del resumen">
            <button type="button" role="tab" aria-selected={vista === "mensual"} className="dash-tab" onClick={() => crossfade(() => setVista("mensual"))}>Mensual</button>
            <button type="button" role="tab" aria-selected={vista === "anual"} className="dash-tab" onClick={() => crossfade(() => setVista("anual"))}>Anual</button>
          </div>
          <div className="field" style={{ width: 110 }}>
            <label htmlFor="fund-anio">Año</label>
            <select id="fund-anio" value={anio} onChange={(e) => onAnio?.(Number(e.target.value))}>
              {anios.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          {vista === "mensual" && (
            <div className="field" style={{ width: 150 }}>
              <label htmlFor="fund-mes">Mes</label>
              <select id="fund-mes" value={mes} onChange={(e) => setMes(Number(e.target.value))}>
                {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </div>
          )}
        </div>
        {accion}
      </div>
    </header>
  );

  if (error) return <div className="resumen-bienestar resumen-fundacion" data-crossfade-raiz>{cabecera}<div className="modal-error">{error}</div></div>;
  if (!resumen) return <div className="resumen-bienestar resumen-fundacion" data-crossfade-raiz>{cabecera}<EsqueletoResumen /></div>;

  const { kpis, porMes, porActividad, categorias, costoPorActividad, proximas, participacion, presupuestoVsGasto, comentariosDestacados } = resumen;
  const realizadas = kpis.porEstado.ejecutada + kpis.porEstado.cerrada;
  const porAcompanamiento = [...participacion.porArea].filter((a) => a.asistieron > 0).sort((a, b) => b.asistieron - a.asistieron);
  const jornadas = [...porActividad].sort((a, b) => b.fecha.localeCompare(a.fecha));

  // "Explicar" de cada tarjeta, igual que en el Dashboard de Compras; se reinicia al cambiar de período.
  const textos = {
    "Personas que acompañaron": entero(kpis.asistentes),
    "Aporte en compras asociadas": fmtCOP(kpis.gastoArea),
    "Asistencia": pct(kpis.asistencia),
    "Costo por persona": kpis.costoPorAsistente ? fmtCOP(kpis.costoPorAsistente) : "—",
    "Presupuesto y gasto": `Presupuesto ${fmtCOP(kpis.presupuestoAsignado)}, gastado ${fmtCOP(kpis.gastoActividades - kpis.gastoSinPresupuesto)}`,
  };
  const mesExplica = vista === "mensual" ? mes : null;
  const explica = (etiqueta) => ({
    texto: textos[etiqueta],
    clave: `${anio}-${mesExplica}`,
    explicar: () => explicarIndicadorBienestarApi({ linea: "Fundación", anio, mes: mesExplica, label: etiqueta, valor: textos[etiqueta] }),
  });

  return (
    <div className={`resumen-bienestar resumen-fundacion${actualizando ? " actualizando" : ""}`} aria-busy={actualizando} data-crossfade-raiz>
      {cabecera}

      <div className="fundacion-impacto">
        <Cifra {...explica("Personas que acompañaron")} grande etiqueta="Personas que acompañaron" valor={<AnimatedNumber value={kpis.asistentes} format={entero} />} nota={`En ${realizadas} jornada(s) realizadas · ${periodo}`} />
        <Cifra {...explica("Aporte en compras asociadas")} grande etiqueta="Aporte en compras asociadas" valor={<AnimatedNumber value={kpis.gastoArea} format={fmtCOP} />} nota={`${kpis.comprasArea} compra(s) asociadas a jornadas`} />
        <Cifra {...explica("Asistencia")} etiqueta="Asistencia" valor={kpis.asistencia == null ? "—" : pct(kpis.asistencia)} nota={`${entero(participacion.noAsistieron)} no pudieron ir · ${entero(participacion.sinRegistrar || 0)} sin asistencia registrada`} />
        <Cifra {...explica("Costo por persona")} etiqueta="Costo por persona" valor={kpis.costoPorAsistente ? fmtCOP(kpis.costoPorAsistente) : "—"} nota="Aporte ÷ personas de esas jornadas" />
        <Cifra {...explica("Presupuesto y gasto")} etiqueta="Presupuesto y gasto"><ComparaPresupuesto presupuesto={kpis.presupuestoAsignado} gastado={kpis.gastoActividades} gastoSinPresupuesto={kpis.gastoSinPresupuesto} /></Cifra>
      </div>

      <ComprasSinActividad datos={resumen.comprasSinActividad} anio={anio} mes={vista === "mensual" ? mes : null} linea="Fundación" periodo={periodo} puedeEditar={puedeEditar} onCambio={() => setRecarga((n) => n + 1)} />

      <AnalisisNova linea="Fundación" anio={anio} mes={vista === "mensual" ? mes : 0} puedeEditar={puedeEditar} />

      <div className="resumen-fila">
        <section className="resumen-card resumen-grafica" aria-labelledby="fund-graf">
          <h2 id="fund-graf">{vista === "anual" ? "Acompañamiento y aporte, mes a mes" : `Cómo va ${MESES[mes - 1].toLowerCase()}`}</h2>
          <p className="card-sub">{vista === "anual" ? "Barras: lo invertido. Línea: personas que acompañaron." : "Frente al mes anterior, y cada jornada con su asistencia y su gasto."}</p>
          {vista === "anual" ? (
            porMes.some((m) => m.asistentes || m.gastoArea) ? (
              <ComboChartSvg data={porMes.map((m, i) => ({ key: String(m.mes), label: MES_CORTO[i], bar: m.gastoArea, line: m.asistentes }))} barName="Aporte (Compras)" lineName="Personas" formatLine={entero} />
            ) : <div className="empty">Aún no hay jornadas ni aportes en {anio}.</div>
          ) : (
            <ResumenDelMes mes={mes} anio={anio} porMes={porMes} porActividad={porActividad} kpis={kpis} onAbrirActividad={onAbrirActividad} etiquetaActividades="Jornadas" etiquetaPersonas="Personas que acompañaron" />
          )}
        </section>
      </div>

      <section className="resumen-card" aria-labelledby="fund-jornadas">
        <div className="resumen-card-head">
          <div>
            <h2 id="fund-jornadas">Las jornadas</h2>
            <p className="card-sub">Cada encuentro con la Fundación: cuántos fuimos y lo que se invirtió, {periodo}.</p>
          </div>
          <button type="button" className="btn small" onClick={onVerActividades}>Ver todas</button>
        </div>
        {jornadas.length === 0 ? <p className="count-note">Sin jornadas en {periodo}.</p> : (
          <ol className="fundacion-jornadas">
            {jornadas.slice(0, JORNADAS_VISIBLES).map((a) => (
              <li key={a.id}>
                <button type="button" onClick={() => onAbrirActividad(a.id)}>
                  <span className="fundacion-jornada-fecha">{Number(a.fecha.slice(8, 10))} {MES_CORTO[Number(a.fecha.slice(5, 7)) - 1]}</span>
                  <span className="fundacion-jornada-nombre">{a.nombre}</span>
                  <span className="count-note">{entero(a.asistentes)} persona(s) · {a.gastado ? fmtCOP(a.gastado) : "sin compras asociadas"}</span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>

      <div className="resumen-fila">
        <section className="resumen-card" aria-labelledby="fund-areas">
          <h2 id="fund-areas">Las áreas que más se suman</h2>
          <p className="card-sub">Personas de cada área que asistieron.</p>
          {porAcompanamiento.length ? (
            <HBarChartSvg data={porAcompanamiento.slice(0, 10).map((a) => ({ key: a.area, label: a.area, value: a.asistieron, detalle: `${a.inscritos} inscritos · ${a.noAsistieron} no pudieron ir` }))} formatValue={entero} color="var(--accent)" />
          ) : <p className="count-note">Aún no hay asistencia registrada por área en el período.</p>}
        </section>
        <section className="resumen-card" aria-labelledby="fund-costo">
          <h2 id="fund-costo">Costo por persona, por jornada</h2>
          <p className="card-sub">Compras de la jornada ÷ personas que asistieron.</p>
          {costoPorActividad.length ? (
            <HBarChartSvg data={costoPorActividad.slice(0, 8).map((a) => ({ key: String(a.id), id: a.id, label: a.nombre, value: Math.round(a.costoPorAsistente), detalle: `${fmtCOP(a.gastado)} · ${a.asistentes} personas` }))} formatLabel={fmtCOP} color="var(--secondary)" onSelect={(d) => onAbrirActividad(d.id)} />
          ) : <p className="count-note">Ninguna jornada tiene todavía compras asociadas y asistentes registrados.</p>}
        </section>
      </div>

      <div className="resumen-fila">
        <section className="resumen-card" aria-labelledby="fund-presu">
          <h2 id="fund-presu">Lo invertido frente a lo presupuestado</h2>
          <p className="card-sub">Por jornada; al pasar el cursor, su presupuesto.</p>
          {presupuestoVsGasto.length ? (
            <HBarChartSvg data={presupuestoVsGasto.slice(0, 8).map((a) => ({ key: String(a.id), id: a.id, label: a.nombre, value: a.gastado, detalle: a.presupuesto ? `Presupuesto ${fmtCOP(a.presupuesto)} · ${pct(a.gastado / a.presupuesto)} usado` : "Sin presupuesto asignado" }))} color="var(--secondary)" onSelect={(d) => onAbrirActividad(d.id)} />
          ) : <p className="count-note">Ninguna jornada del período tiene presupuesto ni compras asociadas.</p>}
        </section>
        <section className="resumen-card" aria-labelledby="fund-cat">
          <h2 id="fund-cat">En qué se convierte el aporte</h2>
          <p className="card-sub">Compras asociadas a jornadas, por categoría, {periodo}.</p>
          {categorias.length ? (
            <HBarChartSvg data={categorias.slice(0, 8).map((c) => ({ key: c.nombre, label: c.nombre, value: c.valor, detalle: `${pct(kpis.gastoArea ? c.valor / kpis.gastoArea : null)} del aporte` }))} color="var(--accent)" />
          ) : <p className="count-note">Sin compras en {periodo}.</p>}
        </section>
      </div>

      <div className="resumen-fila">
        <section className="resumen-card" aria-labelledby="fund-motivos">
          <h2 id="fund-motivos">Por qué no pudieron ir</h2>
          <p className="card-sub">{entero(participacion.noAsistieron)} inscrito(s) no asistieron en {periodo}.</p>
          {participacion.motivos.length ? (
            <HBarChartSvg data={participacion.motivos.map((m) => ({ key: m.motivo, label: m.motivo, value: m.n }))} formatValue={entero} color="var(--warning)" />
          ) : <p className="count-note">Nadie registrado como ausente.</p>}
        </section>
        <section className="resumen-card" aria-labelledby="fund-prox">
          <h2 id="fund-prox">Próximas jornadas</h2>
          <p className="card-sub">Lo que viene, para sumar a más personas.</p>
          {proximas.length === 0 ? <p className="count-note">No hay jornadas programadas desde hoy.</p> : (
            <ul className="fundacion-proximas">
              {proximas.map((a) => (
                <li key={a.id}>
                  <button type="button" onClick={() => onAbrirActividad(a.id)}>
                    <span className="mono">{rangoFechas(a)}</span>
                    <span className="fundacion-jornada-nombre">{a.nombre}</span>
                    <span className={`pill ${estadoActividad(a.estado).pill}`}>{estadoActividad(a.estado).label}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <ComentariosDestacados comentarios={comentariosDestacados} periodo={periodo} onAbrir={onAbrirComentario} />
    </div>
  );
}

function Cifra({ etiqueta, valor, nota, grande = false, children, texto, explicar, clave }) {
  return (
    <div className={`fundacion-cifra${grande ? " grande" : ""}`}>
      <span>{etiqueta}</span>
      {children || (
        <>
          <strong>{valor}</strong>
          <span className="count-note">{nota}</span>
        </>
      )}
      <KpiExplain key={clave} label={etiqueta} value={texto} explicar={explicar} pie="Generado por Nova con las cifras del período, solo de compras asociadas a actividades." />
    </div>
  );
}
