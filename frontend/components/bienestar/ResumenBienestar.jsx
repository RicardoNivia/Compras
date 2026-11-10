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
import { estadoActividad } from "@/components/bienestar/actividadesUi";
import { crossfade } from "@/lib/crossfade";

const pct = (v) => (v == null ? "—" : `${(Math.round(v * 1000) / 10).toString().replace(".", ",")} %`);
const MES_CORTO = MESES.map((m) => m.slice(0, 3));
const entero = (v) => Math.round(v).toLocaleString("es-CO");

// Resumen de una línea (Bienestar o Fundación): la participación de las actividades cruzada con lo que cuesta, que
// sale de Compras. Igual que el Dashboard de compras, tiene vista Mensual (un mes, gráfica por actividad) y Anual
// (el año, gráfica por mes). Responde: cuánto se gastó frente a lo presupuestado, qué porcentaje participó, quiénes
// se inscribieron y no asistieron (y por qué) y cómo participó cada área. Datos de /api/actividades/resumen.
export default function ResumenBienestar({ anio, anios = [], onAnio, linea = "Bienestar", puedeEditar, accion, onAbrirActividad, onAbrirComentario, onVerActividades }) {
  const ahora = new Date();
  const [vista, setVista] = useState("anual"); // "mensual" | "anual"
  const [mes, setMes] = useState(ahora.getFullYear() === anio ? ahora.getMonth() + 1 : 1);
  const [resumen, setResumen] = useState(null);
  const [error, setError] = useState("");
  const [actualizando, setActualizando] = useState(false);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let vigente = true;
    setError("");
    setActualizando(true);
    fetchResumenBienestarApi(anio, linea, vista === "mensual" ? mes : null)
      .then((r) => { if (vigente) setResumen(r.resumen); })
      .catch((e) => { if (vigente) setError(e.message || "No se pudo cargar el resumen."); })
      .finally(() => { if (vigente) setActualizando(false); });
    return () => { vigente = false; };
  }, [recarga, anio, linea, vista, mes]);

  const periodo = vista === "mensual" ? `${MESES[mes - 1].toLowerCase()} de ${anio}` : String(anio);

  const controles = (
    <div className="resumen-periodo">
      <div className="dash-tabs" role="tablist" aria-label="Periodo del resumen">
        <button type="button" role="tab" aria-selected={vista === "mensual"} className="dash-tab" onClick={() => crossfade(() => setVista("mensual"))}>Mensual</button>
        <button type="button" role="tab" aria-selected={vista === "anual"} className="dash-tab" onClick={() => crossfade(() => setVista("anual"))}>Anual</button>
      </div>
      <div className="field" style={{ width: vista === "anual" ? 140 : 110 }}>
        <label htmlFor="res-anio">Año</label>
        <select id="res-anio" value={anio} onChange={(e) => onAnio?.(Number(e.target.value))}>
          {anios.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      {vista === "mensual" && (
        <div className="field" style={{ width: 170 }}>
          <label htmlFor="res-mes">Mes</label>
          <select id="res-mes" value={mes} onChange={(e) => setMes(Number(e.target.value))}>
            {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </div>
      )}
      {accion && <div className="resumen-periodo-accion">{accion}</div>}
    </div>
  );

  if (error) return <div className="resumen-bienestar" data-crossfade-raiz>{controles}<div className="modal-error">{error}</div></div>;
  if (!resumen) return <div className="resumen-bienestar" data-crossfade-raiz>{controles}<EsqueletoResumen /></div>;

  const { kpis, porMes, porActividad, categorias, costoPorActividad, proximas, participacion, presupuestoVsGasto, comentariosDestacados } = resumen;
  const lectura = vista === "anual" ? lecturaDelAnio(porMes, kpis) : lecturaDelMes(porActividad, kpis, participacion);

  // "Explicar" de cada tarjeta, igual que en el Dashboard de Compras; se reinicia al cambiar de período.
  const textos = {
    "Presupuesto y gasto": `Presupuesto ${fmtCOP(kpis.presupuestoAsignado)}, gastado ${fmtCOP(kpis.gastoActividades - kpis.gastoSinPresupuesto)}`,
    "Gasto en compras asociadas": fmtCOP(kpis.gastoArea),
    "Participación": pct(kpis.asistencia),
    "No asistieron o sin registrar": `${entero(participacion.noAsistieron + (participacion.sinRegistrar || 0))} (${entero(participacion.noAsistieron)} ausentes, ${entero(participacion.sinRegistrar || 0)} sin asistencia registrada, de ${entero(participacion.inscritos)} inscritos)`,
    "Actividades ejecutadas": entero(kpis.porEstado.ejecutada + kpis.porEstado.cerrada),
    "Costo por asistente": kpis.costoPorAsistente ? fmtCOP(kpis.costoPorAsistente) : "—",
  };
  const mesExplica = vista === "mensual" ? mes : null;
  const explica = (label) => ({
    texto: textos[label],
    clave: `${linea}-${anio}-${mesExplica}`,
    explicar: () => explicarIndicadorBienestarApi({ linea, anio, mes: mesExplica, label, valor: textos[label] }),
  });

  return (
    <div className={`resumen-bienestar${actualizando ? " actualizando" : ""}`} aria-busy={actualizando} data-crossfade-raiz>
      {controles}

      <div className="resumen-kpis">
        <Kpi {...explica("Presupuesto y gasto")} label="Presupuesto y gasto" fuente="cruce"><ComparaPresupuesto presupuesto={kpis.presupuestoAsignado} gastado={kpis.gastoActividades} gastoSinPresupuesto={kpis.gastoSinPresupuesto} /></Kpi>
        <Kpi {...explica("Gasto en compras asociadas")} label="Gasto en compras asociadas" valor={<AnimatedNumber value={kpis.gastoArea} format={fmtCOP} />} sub={`${kpis.comprasArea} compras asociadas a actividades · ${periodo}`} fuente="compras" />
        <Kpi {...explica("Participación")} label="Participación" valor={kpis.asistencia == null ? "—" : <AnimatedNumber value={Math.round(kpis.asistencia * 1000)} format={(v) => pct(v / 1000)} />} sub={`${entero(kpis.asistentes)} asistentes en ${kpis.actividades} actividades`} fuente="bienestar" />
        <Kpi {...explica("No asistieron o sin registrar")} label="No asistieron o sin registrar" valor={<AnimatedNumber value={participacion.noAsistieron + (participacion.sinRegistrar || 0)} format={entero} />} sub={`${entero(participacion.noAsistieron)} ausentes · ${entero(participacion.sinRegistrar || 0)} sin asistencia registrada${participacion.motivos[0] ? ` · motivo más frecuente: ${participacion.motivos[0].motivo}` : ""}`} fuente="bienestar" />
        <Kpi {...explica("Actividades ejecutadas")} label="Actividades ejecutadas" valor={<AnimatedNumber value={kpis.porEstado.ejecutada + kpis.porEstado.cerrada} format={entero} />} sub={`De ${kpis.actividades}: ${kpis.porEstado.programada} programadas, ${kpis.porEstado.creada} sin programar`} fuente="bienestar" />
        <Kpi {...explica("Costo por asistente")} label="Costo por asistente" valor={kpis.costoPorAsistente ? <AnimatedNumber value={kpis.costoPorAsistente} format={fmtCOP} /> : "—"} sub="Compras asociadas ÷ asistentes de esas actividades" fuente="cruce" />
      </div>

      <ComprasSinActividad datos={resumen.comprasSinActividad} anio={anio} mes={vista === "mensual" ? mes : null} linea={linea} periodo={periodo} puedeEditar={puedeEditar} onCambio={() => setRecarga((n) => n + 1)} />

      <AnalisisNova linea={linea} anio={anio} mes={vista === "mensual" ? mes : 0} puedeEditar={puedeEditar} respaldo={lectura} />

      <div className="resumen-fila">
        <section className="resumen-card resumen-grafica" aria-labelledby="res-graf">
          <div className="resumen-card-head">
            <div>
              <h2 id="res-graf">{vista === "anual" ? "Gasto frente a participación, por mes" : `Cómo va ${MESES[mes - 1].toLowerCase()}`}</h2>
              <p className="card-sub">{vista === "anual" ? "Barras: compras asociadas a las actividades del mes. Línea: asistentes." : "Frente al mes anterior, y cada actividad con su asistencia y su gasto."}</p>
            </div>
          </div>
          {vista === "anual" ? (
            porMes.some((m) => m.asistentes || m.gastoArea) ? (
              <ComboChartSvg
                data={porMes.map((m, i) => ({ key: String(m.mes), label: MES_CORTO[i], bar: m.gastoArea, line: m.asistentes }))}
                barName="Gasto (Compras)" lineName="Asistentes" formatLine={entero}
              />
            ) : <div className="empty">Aún no hay gasto ni asistentes en {anio}.</div>
          ) : (
            <ResumenDelMes mes={mes} anio={anio} porMes={porMes} porActividad={porActividad} kpis={kpis} onAbrirActividad={onAbrirActividad} />
          )}
        </section>

      </div>

      <div className="resumen-fila">
        <section className="resumen-card" aria-labelledby="res-presu">
          <h2 id="res-presu">Gasto frente a presupuesto, por actividad</h2>
          <p className="card-sub">Compras asociadas a cada actividad; al pasar el cursor, su presupuesto.</p>
          {presupuestoVsGasto.length ? (
            <HBarChartSvg
              data={presupuestoVsGasto.slice(0, 8).map((a) => ({ key: String(a.id), id: a.id, label: a.nombre, value: a.gastado, detalle: a.presupuesto ? `Presupuesto ${fmtCOP(a.presupuesto)} · ${pct(a.gastado / a.presupuesto)} usado` : "Sin presupuesto asignado" }))}
              color="var(--secondary)"
              onSelect={(d) => onAbrirActividad(d.id)}
            />
          ) : <p className="count-note">Ninguna actividad del período tiene presupuesto ni compras asociadas.</p>}
        </section>
        <section className="resumen-card" aria-labelledby="res-area">
          <h2 id="res-area">Participación por área</h2>
          <p className="card-sub">Inscritos por área; al pasar el cursor, cuántos asistieron y cuántos no.</p>
          {participacion.porArea.length ? (
            <HBarChartSvg
              data={participacion.porArea.slice(0, 10).map((a) => ({ key: a.area, label: a.area, value: a.inscritos, detalle: `${a.asistieron} asistieron (${pct(a.inscritos ? a.asistieron / a.inscritos : null)}) · ${a.noAsistieron} no asistieron` }))}
              formatValue={entero} color="var(--accent)"
            />
          ) : <p className="count-note">Aún no hay participantes registrados en el período.</p>}
        </section>
      </div>

      <div className="resumen-fila">
        <section className="resumen-card" aria-labelledby="res-motivos">
          <h2 id="res-motivos">Por qué no asistieron</h2>
          <p className="card-sub">{entero(participacion.noAsistieron)} inscrito(s) no asistieron en {periodo}.</p>
          {participacion.motivos.length ? (
            <HBarChartSvg data={participacion.motivos.map((m) => ({ key: m.motivo, label: m.motivo, value: m.n }))} formatValue={entero} color="var(--warning)" />
          ) : <p className="count-note">Nadie registrado como ausente.</p>}
        </section>
        <section className="resumen-card" aria-labelledby="res-costo">
          <h2 id="res-costo">Costo por asistente</h2>
          <p className="card-sub">Actividades con compras asociadas: valor de sus compras ÷ asistentes.</p>
          {costoPorActividad.length === 0 ? (
            <p className="count-note">Ninguna actividad tiene todavía compras asociadas y asistentes registrados.</p>
          ) : (
            <HBarChartSvg
              data={costoPorActividad.slice(0, 8).map((a) => ({ key: String(a.id), id: a.id, label: a.nombre, value: Math.round(a.costoPorAsistente), detalle: `${fmtCOP(a.gastado)} en ${a.compras} compra(s) · ${a.asistentes} asistentes` }))}
              formatLabel={fmtCOP} color="var(--accent)" onSelect={(d) => onAbrirActividad(d.id)}
            />
          )}
        </section>
      </div>

      <div className="resumen-fila">
        <section className="resumen-card" aria-labelledby="res-cat">
          <h2 id="res-cat">En qué se invierte</h2>
          <p className="card-sub">Compras asociadas a actividades, por categoría, {periodo}.</p>
          {categorias.length === 0 ? (
            <p className="count-note">Sin compras en {periodo}.</p>
          ) : (
            <HBarChartSvg
              data={categorias.slice(0, 8).map((c) => ({ key: c.nombre, label: c.nombre, value: c.valor, detalle: `${pct(kpis.gastoArea ? c.valor / kpis.gastoArea : null)} del gasto` }))}
              color="var(--secondary)"
            />
          )}
        </section>
        <section className="resumen-card" aria-labelledby="res-prox">
          <div className="resumen-card-head">
            <div>
              <h2 id="res-prox">Próximas actividades</h2>
              <p className="card-sub">Cada actividad con su presupuesto y sus compras, antes del evento.</p>
            </div>
            <button type="button" className="btn small" onClick={onVerActividades}>Ver todas</button>
          </div>
          {proximas.length === 0 ? (
            <p className="count-note">No hay actividades programadas desde hoy en {periodo}.</p>
          ) : (
            <div className="table-scroll">
              <table className="plain-table resumen-proximas">
                <thead><tr><th>Fecha</th><th>Actividad</th><th>Estado</th><th className="num">Presupuesto</th><th /></tr></thead>
                <tbody>
                  {proximas.map((a) => (
                    <tr key={a.id}>
                      <td className="mono">{a.fecha}</td>
                      <td><span className="desc-tooltip-wrap"><span className="desc-text">{a.nombre}</span><span className="desc-tooltip-bubble">{a.nombre}</span></span></td>
                      <td><span className={`pill ${estadoActividad(a.estado).pill}`}>{estadoActividad(a.estado).label}</span></td>
                      <td className="num">{a.presupuesto != null ? fmtCOP(a.presupuesto) : <span className="muted">Sin asignar</span>}</td>
                      <td className="num"><button type="button" className="btn small resumen-asignar" onClick={() => onAbrirActividad(a.id)}>Ver ficha</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <ComentariosDestacados comentarios={comentariosDestacados} periodo={periodo} onAbrir={onAbrirComentario} />
    </div>
  );
}

function Kpi({ label, valor, sub, fuente, children, texto, explicar, clave }) {
  const chip = { bienestar: "Bienestar", compras: "Compras", cruce: "Cruce" }[fuente];
  return (
    <div className="resumen-kpi">
      <div className="resumen-kpi-top">
        <span>{label}</span>
        <span className={`resumen-fuente ${fuente}`}>{chip}</span>
      </div>
      {children || (
        <>
          <strong>{valor}</strong>
          <span className="count-note">{sub}</span>
        </>
      )}
      <KpiExplain key={clave} label={label} value={texto} explicar={explicar} pie="Generado por Nova con las cifras del período, solo de compras asociadas a actividades." />
    </div>
  );
}

// Lectura determinista (sin IA): el mes con más asistentes frente a su parte del gasto, y el mes cuyo gasto pesa
// mucho más que su participación — normalmente porque ahí se pagó algo de otra actividad.
function lecturaDelAnio(porMes, kpis) {
  const totA = porMes.reduce((s, m) => s + m.asistentes, 0);
  const totG = porMes.reduce((s, m) => s + m.gastoArea, 0);
  if (!totA || !totG) return [];
  const out = [];
  const top = [...porMes].sort((a, b) => b.asistentes - a.asistentes)[0];
  out.push(`${MESES[top.mes - 1]} reunió el ${pct(top.asistentes / totA)} de los asistentes con el ${pct(top.gastoArea / totG)} del gasto.`);
  const desbalance = [...porMes].filter((m) => m.gastoArea > 0).sort((a, b) => (b.gastoArea / totG - b.asistentes / totA) - (a.gastoArea / totG - a.asistentes / totA))[0];
  if (desbalance && desbalance.mes !== top.mes && desbalance.gastoArea / totG - desbalance.asistentes / totA > 0.05) {
    out.push(`${MESES[desbalance.mes - 1]} pesa más en gasto (${pct(desbalance.gastoArea / totG)}) que en participación (${pct(desbalance.asistentes / totA)}).`);
  }
  return out;
}

function lecturaDelMes(porActividad, kpis, participacion) {
  const out = [];
  if (!porActividad.length) return out;
  const masGente = [...porActividad].sort((a, b) => b.asistentes - a.asistentes)[0];
  if (masGente.asistentes) out.push(`La de más asistentes fue ${masGente.nombre} (${entero(masGente.asistentes)}).`);
  if (participacion.noAsistieron) out.push(`${entero(participacion.noAsistieron)} inscritos no asistieron${participacion.motivos[0] ? `; el motivo más frecuente fue «${participacion.motivos[0].motivo}»` : ""}.`);
  if (kpis.presupuestoAsignado && kpis.gastoActividades > kpis.presupuestoAsignado) out.push(`Las actividades del mes se pasaron del presupuesto en ${fmtCOP(kpis.gastoActividades - kpis.presupuestoAsignado)}.`);
  return out;
}
