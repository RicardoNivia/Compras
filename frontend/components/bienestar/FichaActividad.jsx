"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { fmtCOP, fmtDateTime } from "@/lib/format";
import {
  fetchActividadApi, updateActividadApi, fetchParticipantesApi, actualizarParticipanteApi, eliminarParticipanteApi,
  crearParticipanteApi, fetchInventarioApi, generarAnalisisActividadApi, fetchMaestroTipoApi, crearItemApi,
  actualizarItemApi, eliminarItemApi, importarInventarioApi, fetchPlantillasFormularioApi, configurarFormularioApi,
} from "@/lib/api";
import { AnimatedNumber } from "@/components/charts/chartKit";
import HBarChartSvg from "@/components/charts/HBarChartSvg";
import ImportarNovaModal from "@/components/bienestar/ImportarNovaModal";
import CerrarActividadModal, { razonParaNoCerrar } from "@/components/bienestar/CerrarActividadModal";
import PiePagina, { usePagina } from "@/components/bienestar/PiePagina";
import SolicitudesActividad from "@/components/bienestar/SolicitudesActividad";
import { EsqueletoFicha, EsqueletoTabla } from "@/components/bienestar/Esqueletos";
import { Estrellas, CalificacionModal, TabCalificaciones } from "@/components/bienestar/CalificacionActividad";
import FotosActividad from "@/components/bienestar/FotosActividad";
import ObservacionesActividad from "@/components/bienestar/ObservacionesActividad";
import AgenteImportacion from "@/components/bienestar/AgenteImportacion";
import { ComentarioConMano } from "@/components/bienestar/Sentimiento";
import { IconPlus, IconTrash, IconDownload, IconCheck } from "@/components/icons";
import { estadoActividad, pctClase, rangoFechas } from "@/components/bienestar/actividadesUi";
import { crossfade } from "@/lib/crossfade";
import MoneyInput from "@/components/MoneyInput";

const PAGE_SIZES = [25, 50, 100];
const entero = (v) => Math.round(v).toLocaleString("es-CO");
const pct = (v) => (v == null ? "—" : `${(Math.round(v * 1000) / 10).toString().replace(".", ",")} %`);

// Ficha de una actividad de Bienestar: todo su detalle para ir desglosando — presupuesto contra gasto, inscritos y
// quiénes no asistieron (con su motivo), participación por área, inventario (qué se usó y qué quedó), compras,
// formulario público de inscripción y el cierre con calificación.
export default function FichaActividad({ actividadId, puedeEditar, basePath }) {
  const [act, setAct] = useState(null);
  const [error, setError] = useState("");
  // Al cerrar desde el formulario llega con ?tab=calificaciones.
  const [tab, setTab] = useState(useSearchParams().get("tab") === "calificaciones" ? "calificaciones" : "resumen");
  const [cerrar, setCerrar] = useState(false);
  const [verCalificacion, setVerCalificacion] = useState(false);

  const cargar = useCallback(() => {
    fetchActividadApi(actividadId).then((r) => setAct(r.actividad)).catch((e) => setError(e.message || "No se pudo cargar la actividad."));
  }, [actividadId]);
  useEffect(() => { cargar(); }, [cargar]);

  if (error) return <div className="modal-error">{error}</div>;
  if (!act) return <EsqueletoFicha />;

  const est = estadoActividad(act.estado);
  const p = act.participacion;
  const presupuesto = act.presupuesto || 0;
  const disponible = presupuesto - act.gastado;
  const asistencia = p.inscritos ? p.asistieron / p.inscritos : act.inscritos ? (act.asistentes || 0) / act.inscritos : null;
  const cerrada = act.estado === "cerrada";

  return (
    <div className="ficha">
      <div className="ficha-head">
        <div className="ficha-head-txt">
          <Link href={`${basePath}/actividades`} className="ficha-volver">← Actividades {act.linea === "Fundación" ? "de Fundación" : ""}</Link>
          <h1>{act.nombre}</h1>
          <div className="actividad-chips">
            <span className="actividad-chip">{rangoFechas(act)}</span>
            <span className={`bienestar-linea ${act.linea === "Fundación" ? "fundacion" : ""}`}>{act.linea}</span>
            <span className={`pill ${est.pill}`}>{est.label}</span>
            {!act.enCronograma && <span className="actividad-chip">Fuera del cronograma</span>}
            {act.responsableNombre && <span className="actividad-chip">Responsable: {act.responsableNombre}</span>}
          </div>
        </div>
        <div className="ficha-head-acciones">
          {puedeEditar && !cerrada && <Link className="btn" href={`${basePath}/actividades/${act.id}/editar`}>Editar</Link>}
          {puedeEditar && !cerrada && (
            <button type="button" className="btn btn-primary" onClick={() => setCerrar(true)} disabled={!!razonParaNoCerrar(act)} title={razonParaNoCerrar(act) || "Calificar y cerrar la actividad"}>
              <IconCheck size={13} /> Cerrar actividad
            </button>
          )}
          {(cerrada || act.analisisNova) && (
            <button type="button" className="ficha-cierre" onClick={() => setVerCalificacion(true)} title="Ver la calificación y el análisis de Nova">
              <Estrellas valor={act.calificacion ?? act.analisisNova?.puntaje} />
              {cerrada ? `Cerrada por ${act.cerradaPorNombre || "—"}${act.cerradaAt ? ` · ${fmtDateTime(act.cerradaAt)}` : ""}` : "Análisis de Nova"}
            </button>
          )}
        </div>
      </div>

      <div className="resumen-kpis">
        <Kpi label="Presupuesto" valor={act.presupuesto != null ? <AnimatedNumber value={presupuesto} format={fmtCOP} /> : "Sin asignar"} sub={act.presupuesto != null ? `Disponible ${fmtCOP(disponible)}` : (cerrada ? "No se asignó" : "Asígnalo en Editar")} />
        <Kpi label="Gastado" valor={<AnimatedNumber value={act.gastado} format={fmtCOP} />} sub={act.pctPresupuesto != null ? `${pct(act.pctPresupuesto)} del presupuesto · ${act.compras} compra(s)` : `${act.compras} compra(s) asociada(s)`} clase={act.pctPresupuesto != null ? pctClase(act.pctPresupuesto) : ""} />
        {act.aplicaParticipantes ? (
          <>
        <Kpi label="Inscritos" valor={<AnimatedNumber value={p.inscritos || act.inscritos || 0} format={entero} />} sub={p.total ? `${p.sinRegistrar} sin asistencia registrada` : "Sin lista de inscritos"} />
        <Kpi label="Asistieron" valor={<AnimatedNumber value={p.total ? p.asistieron : act.asistentes || 0} format={entero} />} sub={`Participación ${pct(asistencia)}`} />
        <Kpi label="No asistieron" valor={<AnimatedNumber value={p.noAsistieron} format={entero} />} sub={p.motivos[0] ? `Más frecuente: ${p.motivos[0].motivo}` : "—"} clase={p.noAsistieron ? "warning" : ""} />
        <Kpi label="Costo por asistente" valor={(p.asistieron || act.asistentes) && act.gastado ? fmtCOP(act.gastado / (p.asistieron || act.asistentes)) : "—"} sub={p.calificacionPromedio ? `Calificación de asistentes ${p.calificacionPromedio.toFixed(1).replace(".", ",")} / 5 (${p.calificaciones})` : "Sin calificaciones de asistentes"} />
          </>
        ) : <Kpi label="Participantes y asistencia" valor="No aplica" sub="Esta actividad no los maneja" />}
      </div>

      <div className="dash-tabs ficha-tabs" role="tablist" aria-label="Secciones de la actividad">
        {[["resumen", "Resumen"], ["calificaciones", "Calificación Nova y calificación usuario"], ...(act.aplicaParticipantes ? [["participantes", `Participantes (${p.total})`]] : []), ["observaciones", `Encuesta y observaciones (${act.totalObservaciones})`], ["inventario", `Inventario (${act.inventario.items.length})`], ["fotos", `Fotos (${act.fotos})`], ["compras", `Compras (${act.compras})`], ...(puedeEditar && !cerrada ? [["agente", "Agente de importación"]] : []), ...(act.aplicaParticipantes ? [["formulario", "Formulario de inscripción"]] : [])].map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className="dash-tab" onClick={() => crossfade(() => setTab(k))}>{l}</button>
        ))}
      </div>

      {tab === "resumen" && <TabResumen act={act} />}
      {tab === "calificaciones" && <TabCalificaciones act={act} puedeEditar={puedeEditar} onCambio={cargar} />}
      {tab === "participantes" && <TabParticipantes act={act} puedeEditar={puedeEditar && !cerrada} onCambio={cargar} />}
      {tab === "observaciones" && <ObservacionesActividad act={act} puedeEditar={puedeEditar && !cerrada} onCambio={cargar} />}
      {tab === "agente" && <AgenteImportacion act={act} onCambio={cargar} />}
      {tab === "inventario" && <TabInventario act={act} puedeEditar={puedeEditar && !cerrada} onCambio={cargar} />}
      {tab === "fotos" && <FotosActividad actividadId={act.id} puedeEditar={puedeEditar && !cerrada} onCambio={cargar} />}
      {tab === "compras" && <TabCompras act={act} puedeEditar={puedeEditar} cerrada={cerrada} editarHref={`${basePath}/actividades/${act.id}/editar`} />}
      {tab === "formulario" && <TabFormulario act={act} puedeEditar={puedeEditar && !cerrada} onCambio={cargar} />}

      {verCalificacion && <CalificacionModal actividadId={act.id} puedeEditar={puedeEditar} onClose={() => setVerCalificacion(false)} onCambio={cargar} />}
      {cerrar && <CerrarActividadModal act={act} onClose={() => setCerrar(false)} onCerrada={() => { setCerrar(false); setTab("calificaciones"); cargar(); }} />}
    </div>
  );
}

function Kpi({ label, valor, sub, clase = "" }) {
  return (
    <div className="resumen-kpi">
      <div className="resumen-kpi-top"><span>{label}</span></div>
      <strong className={clase ? `ficha-kpi-${clase}` : ""}>{valor}</strong>
      <span className="count-note">{sub}</span>
    </div>
  );
}

function TabResumen({ act }) {
  const p = act.participacion;
  const inv = act.inventario.resumen;
  return (
    <div className="resumen-bienestar">
      {act.aplicaParticipantes && <div className="resumen-fila">
        <section className="resumen-card" aria-labelledby="f-area">
          <h2 id="f-area">Participación por área</h2>
          <p className="card-sub">Inscritos de cada área; al pasar el cursor, cuántos asistieron y cuántos no.</p>
          {p.porArea.length ? (
            <HBarChartSvg
              data={p.porArea.slice(0, 12).map((a) => ({ key: a.area, label: a.area, value: a.inscritos, detalle: `${a.asistieron} asistieron · ${a.noAsistieron} no asistieron` }))}
              formatValue={entero}
              color="var(--accent)"
            />
          ) : <p className="count-note">Aún no hay participantes registrados.</p>}
        </section>
        <section className="resumen-card" aria-labelledby="f-motivos">
          <h2 id="f-motivos">Por qué no asistieron</h2>
          <p className="card-sub">{p.noAsistieron} inscrito(s) no asistieron.</p>
          {p.motivos.length ? (
            <HBarChartSvg data={p.motivos.map((m) => ({ key: m.motivo, label: m.motivo, value: m.n }))} formatValue={entero} color="var(--warning)" />
          ) : <p className="count-note">Nadie registrado como ausente.</p>}
        </section>
      </div>}
      <div className="resumen-fila">
        <section className="resumen-card" aria-labelledby="f-presu">
          <h2 id="f-presu">Gasto frente al presupuesto</h2>
          <p className="card-sub">Compras asociadas a la actividad.</p>
          <HBarChartSvg
            data={[{ key: "p", label: "Presupuesto asignado", value: act.presupuesto || 0 }, { key: "g", label: "Gastado (compras)", value: act.gastado }]}
            color="var(--secondary)"
          />
          {act.presupuesto != null && act.gastado > act.presupuesto && <p className="modal-error" style={{ marginTop: 8 }}>Se pasó del presupuesto en {fmtCOP(act.gastado - act.presupuesto)}.</p>}
        </section>
        <section className="resumen-card" aria-labelledby="f-inv">
          <h2 id="f-inv">Inventario</h2>
          <p className="card-sub">{inv.items} ítem(s){inv.sinRegistrarUso ? ` · ${inv.sinRegistrarUso} sin registrar cuánto se usó` : ""}.</p>
          <div className="actividad-cifras">
            <div><span>Costo del inventario</span><strong>{fmtCOP(inv.costoTotal)}</strong></div>
            <div><span>Costo de lo que sobró</span><strong className={inv.costoSobrante ? "actividad-warning-color" : ""}>{fmtCOP(inv.costoSobrante)}</strong></div>
          </div>
        </section>
      </div>
      {(act.comentarioCierre || act.descripcion || act.observaciones) && (
        <section className="resumen-card">
          <h2>Notas</h2>
          {act.descripcion && <p className="ficha-nota"><strong>Descripción:</strong> {act.descripcion}</p>}
          {act.observaciones && <p className="ficha-nota"><strong>Observaciones:</strong> {act.observaciones}</p>}
          {act.comentarioCierre && <p className="ficha-nota"><strong>Comentario de cierre:</strong> {act.comentarioCierre}</p>}
        </section>
      )}
    </div>
  );
}

// ---------- Participantes ----------
function TabParticipantes({ act, puedeEditar, onCambio }) {
  const [lista, setLista] = useState(null);
  const [motivos, setMotivos] = useState([]);
  const [areasMaestro, setAreasMaestro] = useState([]);
  const [search, setSearch] = useState("");
  const [filtro, setFiltro] = useState("");
  const [area, setArea] = useState("");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [nuevo, setNuevo] = useState(false);
  const [verDatos, setVerDatos] = useState(null);
  const [importar, setImportar] = useState(null); // { tipo, archivo }

  const cargar = useCallback(() => {
    fetchParticipantesApi(act.id).then((r) => { setLista(r.participantes); setMotivos(r.motivos); setAreasMaestro(r.areas || []); }).catch((e) => setError(e.message));
  }, [act.id]);
  useEffect(() => { cargar(); }, [cargar]);

  const areas = useMemo(() => [...new Set((lista || []).map((p) => p.area).filter(Boolean))].sort(), [lista]);
  const filtrados = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (lista || []).filter((p) => (!filtro || (filtro === "si" ? p.asistio === true : filtro === "no" ? p.asistio === false : p.asistio === null))
      && (!area || p.area === area)
      && (!q || `${p.nombre} ${p.documento || ""} ${p.observacion || ""}`.toLowerCase().includes(q)));
  }, [lista, search, filtro, area]);
  useEffect(() => { setPage(1); }, [search, filtro, area, pageSize]);
  const totalPages = Math.max(1, Math.ceil(filtrados.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtrados.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  async function cambiar(pp, data) {
    setError("");
    try {
      const { participante } = await actualizarParticipanteApi(act.id, pp.id, data);
      setLista((l) => l.map((x) => (x.id === pp.id ? participante : x)));
      onCambio();
    } catch (e) {
      setError(e.message);
    }
  }

  function exportarCsv() {
    const enc = ["Nombre", "Documento", "Área", "Asistió", "Motivo", "Calificación", "Observación"];
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const filas = filtrados.map((p) => [p.nombre, p.documento, p.area, p.asistio === true ? "Sí" : p.asistio === false ? "No" : "", p.motivoInasistencia, p.calificacion, p.observacion].map(esc).join(";"));
    const blob = new Blob([`﻿${enc.join(";")}\n${filas.join("\n")}`], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `participantes-${act.nombre.replace(/[^\w]+/g, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (!lista) return <EsqueletoTabla etiqueta="Cargando los participantes" />;

  return (
    <div className="ficha-seccion">
      <div className="toolbar" style={{ flexWrap: "wrap", gap: 10 }}>
        <div className="field search-field">
          <label htmlFor="pa-search">Buscar</label>
          <input id="pa-search" type="search" placeholder="Nombre, documento u observación…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="pa-filtro">Asistencia</label>
          <select id="pa-filtro" value={filtro} onChange={(e) => setFiltro(e.target.value)}>
            <option value="">Todos</option>
            <option value="si">Asistieron</option>
            <option value="no">No asistieron</option>
            <option value="sin">Sin registrar</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="pa-area">Área</label>
          <select id="pa-area" value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="">Todas</option>
            {areas.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div className="filter-actions">
          <button type="button" className="btn" onClick={exportarCsv}><IconDownload size={13} /> Exportar</button>
          {puedeEditar && <button type="button" className="btn btn-primary" onClick={() => setNuevo(true)}><IconPlus size={13} /> Agregar persona</button>}
        </div>
      </div>

      {puedeEditar && (
        <div className="importar-tarjetas" aria-label="Importar desde Excel con Nova">
          {[
            ["programados", "Programados", "Quiénes se inscribieron o están citados"],
            ["asistentes", "Asistentes", "La planilla o lista de quiénes fueron"],
          ].map(([tipo, titulo, nota]) => (
            <label key={tipo} className="importar-tarjeta">
              <input type="file" accept=".xlsx,.xls" className="importar-input" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) { setError(""); setAviso(""); setImportar({ tipo, archivo: f }); } }} />
              <IconDownload size={15} style={{ transform: "rotate(180deg)" }} />
              <span><strong>Importar {titulo.toLowerCase()}</strong><span className="count-note">{nota}. Nova lo lee y te muestra qué va a cargar.</span></span>
            </label>
          ))}
        </div>
      )}
      {importar && (
        <ImportarNovaModal
          actividadId={act.id}
          tipo={importar.tipo}
          archivo={importar.archivo}
          onClose={() => setImportar(null)}
          onListo={(msg) => { setImportar(null); setAviso(msg); cargar(); onCambio(); }}
        />
      )}
      {aviso && <div className="ficha-aviso" role="status">{aviso}</div>}
      {error && <div className="modal-error">{error}</div>}

      <div className="table-card">
        <div className="table-scroll">
          <table className="records ficha-tabla">
            <thead>
              <tr>
                <th>Nombre</th><th>Documento</th><th>Área</th><th>Asistencia</th><th>Motivo</th><th className="num">Calif.</th><th>Observación</th><th>Origen</th><th className="actions-col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 && <tr><td colSpan={9}><div className="empty">{lista.length ? "Nadie coincide con los filtros." : "Aún no hay inscritos. Impórtalos de Excel, agrégalos o abre el formulario de inscripción."}</div></td></tr>}
              {pageRows.map((pp) => (
                <tr key={pp.id}>
                  <td><span className="desc-tooltip-wrap"><span className="desc-text">{pp.nombre}</span><span className="desc-tooltip-bubble">{pp.nombre}</span></span></td>
                  <td className="mono">{pp.documento || "—"}</td>
                  <td className="truncate">{pp.area || "—"}</td>
                  <td>
                    <div className="ficha-asistencia" role="group" aria-label={`Asistencia de ${pp.nombre}`}>
                      {[[true, "Sí"], [false, "No"], [null, "—"]].map(([v, l]) => (
                        <button key={l} type="button" className={pp.asistio === v ? `on ${v === true ? "si" : v === false ? "no" : "sin"}` : ""} aria-pressed={pp.asistio === v} disabled={!puedeEditar} onClick={() => pp.asistio !== v && cambiar(pp, { asistio: v })}>{l}</button>
                      ))}
                    </div>
                  </td>
                  <td>
                    {pp.asistio === false ? (
                      <select aria-label="Motivo" value={pp.motivoInasistencia || ""} disabled={!puedeEditar} onChange={(e) => cambiar(pp, { motivoInasistencia: e.target.value || null })}>
                        <option value="">Sin motivo</option>
                        {motivos.map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                    ) : <span className="muted">—</span>}
                  </td>
                  <td className="num">{pp.calificacion ? `${pp.calificacion} ★` : "—"}</td>
                  <td>{pp.observacion ? <ComentarioConMano texto={pp.observacion} sentimiento={pp.sentimiento} /> : "—"}</td>
                  <td><span className="pill muted">{{ formulario: "Formulario", importacion: "Excel", manual: "Manual" }[pp.origen] || pp.origen}</span></td>
                  <td className="actions-cell">
                    <div className="row-actions">
                      {(Object.keys(pp.datos).length > 0 || pp.datosOcultos > 0) && <button type="button" className="btn small" onClick={() => setVerDatos(pp)}>Datos</button>}
                      {puedeEditar && <button type="button" className="icon-action-btn delete" title="Quitar de la actividad" aria-label={`Quitar a ${pp.nombre}`} onClick={async () => { if (window.confirm(`¿Quitar a ${pp.nombre} de la actividad?`)) { await eliminarParticipanteApi(act.id, pp.id).catch((e) => setError(e.message)); cargar(); onCambio(); } }}><IconTrash size={13} /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="table-footer">
          <div className="field" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <label htmlFor="pa-pagesize" style={{ marginBottom: 0 }}>Tamaño</label>
            <select id="pa-pagesize" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>{PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}</select>
          </div>
          <div className="page-btns">
            <button type="button" className="btn small" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Anterior</button>
            <button type="button" className="btn small" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>Siguiente</button>
          </div>
          <span className="count-note">Página {currentPage} de {totalPages}</span>
          <div className="spacer" />
          <span className="count-note">{filtrados.length} persona(s) (de {lista.length})</span>
        </div>
      </div>

      {nuevo && <ModalNuevoParticipante act={act} motivos={motivos} areas={areasMaestro} onClose={() => setNuevo(false)} onCreado={() => { setNuevo(false); cargar(); onCambio(); }} />}
      {verDatos && (
        <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setVerDatos(null); }}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="pa-datos-t">
            <div className="modal-head"><h3 id="pa-datos-t">{verDatos.nombre}</h3><button type="button" className="btn-ghost icon-btn" onClick={() => setVerDatos(null)} aria-label="Cerrar">✕</button></div>
            <div className="modal-body" style={{ display: "block" }}>
              <dl className="ficha-datos">
                {Object.entries(verDatos.datos).map(([k, v]) => (<div key={k}><dt>{k}</dt><dd>{v}</dd></div>))}
              </dl>
              {verDatos.datosOcultos > 0 && <p className="count-note">{verDatos.datosOcultos} dato(s) sensible(s) ocultos: solo los ve quien puede editar Bienestar.</p>}
              {verDatos.autorizaDatos && <p className="count-note">Autorizó el tratamiento de sus datos en el formulario.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ModalNuevoParticipante({ act, motivos, areas, onClose, onCreado }) {
  const [f, setF] = useState({ nombre: "", documento: "", area: "", asistio: "", motivoInasistencia: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function guardar(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await crearParticipanteApi(act.id, { ...f, asistio: f.asistio === "si" ? true : f.asistio === "no" ? false : null, motivoInasistencia: f.asistio === "no" ? f.motivoInasistencia || null : null });
      onCreado();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="np-t">
        <div className="modal-head"><h3 id="np-t">Agregar persona</h3><button type="button" className="btn-ghost icon-btn" onClick={onClose} aria-label="Cerrar">✕</button></div>
        <form onSubmit={guardar}>
          <div className="modal-body">
            <div className="field full"><label htmlFor="np-nombre">Nombre completo *</label><input id="np-nombre" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></div>
            <div className="field"><label htmlFor="np-doc">Documento</label><input id="np-doc" inputMode="numeric" value={f.documento} onChange={(e) => setF({ ...f, documento: e.target.value })} /></div>
            <div className="field"><label htmlFor="np-area">Área</label><select id="np-area" value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })}><option value="">Sin área</option>{areas.map((a) => <option key={a} value={a}>{a}</option>)}</select></div>
            <div className="field"><label htmlFor="np-asis">Asistencia</label><select id="np-asis" value={f.asistio} onChange={(e) => setF({ ...f, asistio: e.target.value })}><option value="">Sin registrar</option><option value="si">Asistió</option><option value="no">No asistió</option></select></div>
            {f.asistio === "no" && <div className="field"><label htmlFor="np-mot">Motivo</label><select id="np-mot" value={f.motivoInasistencia} onChange={(e) => setF({ ...f, motivoInasistencia: e.target.value })}><option value="">Sin motivo</option>{motivos.map((m) => <option key={m} value={m}>{m}</option>)}</select></div>}
            {error && <div className="modal-error full">{error}</div>}
          </div>
          <div className="modal-foot">
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving && <span className="spinner" />} Agregar</button>
            <button type="button" className="btn" onClick={onClose} disabled={saving}>Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------- Inventario ----------
function TabInventario({ act, puedeEditar, onCambio }) {
  const [items, setItems] = useState(act.inventario.items);
  const [resumen, setResumen] = useState(act.inventario.resumen);
  const [unidades, setUnidades] = useState([]);
  useEffect(() => { fetchMaestroTipoApi("unidadInventario").then((r) => setUnidades(r.maestros.map((m) => m.valor))).catch(() => {}); }, []);
  const [nuevo, setNuevo] = useState({ item: "", unidad: "", cantidad: "", costoUnitario: "" });
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const archivo = useRef(null);

  const recargar = async () => {
    const r = await fetchInventarioApi(act.id);
    setItems(r.items);
    setResumen(r.resumen);
    onCambio();
  };
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = items.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  async function agregar(e) {
    e.preventDefault();
    setError("");
    try {
      await crearItemApi(act.id, nuevo);
      setNuevo({ item: "", unidad: "", cantidad: "", costoUnitario: "" });
      await recargar();
    } catch (err) {
      setError(err.message);
    }
  }

  async function guardarUsado(it, valor) {
    setError("");
    try {
      await actualizarItemApi(act.id, it.id, { usado: valor === "" ? null : Number(valor) });
      await recargar();
    } catch (err) {
      setError(err.message);
    }
  }

  async function importar(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setError("");
    try {
      const r = await importarInventarioApi(act.id, f);
      setAviso(`${r.creados} ítem(s) nuevos y ${r.actualizados} actualizados.`);
      await recargar();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="ficha-seccion">
      <div className="actividad-cifras">
        <div><span>Ítems</span><strong>{resumen.items}</strong></div>
        <div><span>Costo del inventario</span><strong>{fmtCOP(resumen.costoTotal)}</strong></div>
        <div><span>Costo de lo que sobró</span><strong className={resumen.costoSobrante ? "actividad-warning-color" : ""}>{fmtCOP(resumen.costoSobrante)}</strong></div>
        <div><span>Sin registrar cuánto se usó</span><strong>{resumen.sinRegistrarUso}</strong></div>
      </div>
      {puedeEditar && (
        <form className="ficha-import" onSubmit={agregar}>
          <span className="ficha-import-titulo">Agregar ítem</span>
          <input aria-label="Ítem" placeholder="Ítem (ej. Refrigerios)" value={nuevo.item} onChange={(e) => setNuevo({ ...nuevo, item: e.target.value })} />
          <input aria-label="Cantidad" type="number" min="0" step="any" placeholder="Cantidad" value={nuevo.cantidad} onChange={(e) => setNuevo({ ...nuevo, cantidad: e.target.value })} style={{ width: 110 }} />
          <select aria-label="Unidad" value={nuevo.unidad} onChange={(e) => setNuevo({ ...nuevo, unidad: e.target.value })} style={{ width: 120 }}><option value="">Unidad</option>{unidades.map((u) => <option key={u} value={u}>{u}</option>)}</select>
          <MoneyInput prefix={null} ariaLabel="Costo unitario" placeholder="Costo unitario" value={nuevo.costoUnitario} onChange={(x) => setNuevo({ ...nuevo, costoUnitario: x })} decimales={2} style={{ width: 140 }} />
          <button type="submit" className="btn btn-primary"><IconPlus size={13} /> Agregar</button>
        </form>
      )}
      {puedeEditar && (
        <div className="importar-tarjetas" aria-label="Importar inventario desde Excel">
          <label className="importar-tarjeta">
            <input ref={archivo} type="file" accept=".xlsx,.xls" className="importar-input" onChange={importar} />
            <IconDownload size={15} style={{ transform: "rotate(180deg)" }} />
            <span><strong>Importar inventario</strong><span className="count-note">Un Excel con Ítem, Cantidad, Unidad, Costo unitario y Usado. Los ítems que ya existen se actualizan.</span></span>
          </label>
        </div>
      )}
      {aviso && <div className="ficha-aviso" role="status">{aviso}</div>}
      {error && <div className="modal-error">{error}</div>}
      <div className="table-card">
        <div className="table-scroll">
          <table className="records ficha-tabla">
            <thead><tr><th>Ítem</th><th>Unidad</th><th className="num">Cantidad</th><th className="num">Usado</th><th className="num">Sobró</th><th className="num">Costo unit.</th><th className="num">Costo total</th><th className="num">Costo sobrante</th><th className="actions-col">Acciones</th></tr></thead>
            <tbody>
              {pageRows.length === 0 && <tr><td colSpan={9}><div className="empty">Sin inventario. Agrega ítems o sube un Excel con Ítem, Cantidad, Unidad, Costo unitario y Usado.</div></td></tr>}
              {pageRows.map((it) => (
                <tr key={it.id}>
                  <td><span className="desc-tooltip-wrap"><span className="desc-text">{it.item}</span><span className="desc-tooltip-bubble">{it.item}</span></span></td>
                  <td>{it.unidad || "—"}</td>
                  <td className="num">{it.cantidad}</td>
                  <td className="num">
                    {puedeEditar ? (
                      <input aria-label={`Usado de ${it.item}`} type="number" min="0" max={it.cantidad} step="any" defaultValue={it.usado ?? ""} className="ficha-input-num" onBlur={(e) => { if (String(it.usado ?? "") !== e.target.value) guardarUsado(it, e.target.value); }} />
                    ) : it.usado ?? "—"}
                  </td>
                  <td className="num">{it.sobrante ?? "—"}</td>
                  <td className="num">{it.costoUnitario != null ? fmtCOP(it.costoUnitario) : "—"}</td>
                  <td className="num">{it.costoTotal != null ? fmtCOP(it.costoTotal) : "—"}</td>
                  <td className="num">{it.costoSobrante != null ? fmtCOP(it.costoSobrante) : "—"}</td>
                  <td className="actions-cell">{puedeEditar && <button type="button" className="icon-action-btn delete" aria-label={`Quitar ${it.item}`} onClick={async () => { if (window.confirm(`¿Quitar "${it.item}" del inventario?`)) { await eliminarItemApi(act.id, it.id).catch((e) => setError(e.message)); recargar(); } }}><IconTrash size={13} /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="table-footer">
          <div className="field" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <label htmlFor="inv-pagesize" style={{ marginBottom: 0 }}>Tamaño</label>
            <select id="inv-pagesize" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>{PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}</select>
          </div>
          <div className="page-btns">
            <button type="button" className="btn small" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Anterior</button>
            <button type="button" className="btn small" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>Siguiente</button>
          </div>
          <span className="count-note">Página {currentPage} de {totalPages}</span>
          <div className="spacer" />
          <span className="count-note">{items.length} ítem(s)</span>
        </div>
      </div>
    </div>
  );
}

// ---------- Compras ----------
function TabCompras({ act, puedeEditar, cerrada, editarHref }) {
  const [buscar, setBuscar] = useState("");
  const filtradas = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return act.detalleCompras.filter((c) => !q || [c.localSeq, c.descripcion, c.proveedor, c.estadoLegalizacion, c.fechaSolicitud].some((v) => String(v ?? "").toLowerCase().includes(q)));
  }, [act.detalleCompras, buscar]);
  const pag = usePagina(filtradas, buscar);
  return (
    <div className="ficha-seccion">
      <SolicitudesActividad actividadId={act.id} puedeSolicitar={puedeEditar && !cerrada} />
      <div className="ficha-import">
        <span className="ficha-import-titulo">{act.compras} compra(s) · {fmtCOP(act.gastado)}{act.presupuesto != null ? ` de ${fmtCOP(act.presupuesto)}` : ""}</span>
        <span className="spacer" />
        {puedeEditar && !cerrada && <Link className="btn" href={`${editarHref}?paso=compras`}>Asociar compras</Link>}
      </div>
      <div className="field search-field" style={{ maxWidth: 360 }}>
        <label htmlFor="fc-buscar">Buscar compra</label>
        <input id="fc-buscar" type="search" placeholder="Número, descripción o proveedor…" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
      </div>
      <div className="table-card">
        <div className="table-scroll">
          <table className="records ficha-tabla">
            <thead><tr><th>#</th><th>Solicitud</th><th>Descripción</th><th>Proveedor</th><th className="num">Valor con IVA</th><th>Legalización</th><th>Radicada</th></tr></thead>
            <tbody>
              {pag.pagina.length === 0 && <tr><td colSpan={7}><div className="empty">{act.detalleCompras.length ? "Ninguna compra coincide con la búsqueda." : "Aún no hay compras asociadas."}</div></td></tr>}
              {pag.pagina.map((c) => (
                <tr key={c.id}>
                  <td className="mono">#{c.localSeq ?? "—"}</td>
                  <td>{c.fechaSolicitud || "—"}</td>
                  <td><span className="desc-tooltip-wrap"><span className="desc-text">{c.descripcion || "—"}</span><span className="desc-tooltip-bubble">{c.descripcion}</span></span></td>
                  <td className="truncate">{c.proveedor || "—"}</td>
                  <td className="num">{fmtCOP(c.valorConIva || 0)}</td>
                  <td>{c.estadoLegalizacion || "—"}</td>
                  <td>{c.radicado ? "Sí" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <PiePagina id="fc-size" p={pag} total={filtradas.length} etiqueta="compra(s)" />
      </div>
    </div>
  );
}

// ---------- Formulario público ----------
function TabFormulario({ act, puedeEditar, onCambio }) {
  const [plantillas, setPlantillas] = useState([]);
  const [plantilla, setPlantilla] = useState("");
  const [error, setError] = useState("");
  const [copiado, setCopiado] = useState(false);
  useEffect(() => { fetchPlantillasFormularioApi(act.id).then((r) => setPlantillas(r.plantillas)).catch(() => {}); }, [act.id]);
  const enlace = act.formularioToken && typeof window !== "undefined" ? `${window.location.origin}/inscripcion/${act.formularioToken}` : null;

  async function guardar(data) {
    setError("");
    try {
      await configurarFormularioApi(act.id, data);
      onCambio();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="ficha-seccion">
      <section className="resumen-card">
        <h2>Formulario público de inscripción</h2>
        <p className="card-sub">Un enlace que se comparte por Teams o correo: los colaboradores se inscriben sin usuario en la app y aparecen al instante en Participantes. Pide nombre, documento, área, la autorización de tratamiento de datos (Ley 1581) y los campos de la plantilla.</p>
        <label htmlFor="fo-abierto" className="actividad-check" style={{ maxWidth: 420 }}>
          <span>{act.formularioAbierto ? "Recibiendo inscripciones" : "Cerrado"}</span>
          <input id="fo-abierto" type="checkbox" checked={!!act.formularioAbierto} disabled={!puedeEditar} onChange={(e) => guardar({ abierto: e.target.checked })} />
        </label>
        {enlace && (
          <div className="ficha-enlace">
            <input readOnly value={enlace} aria-label="Enlace del formulario" onFocus={(e) => e.target.select()} />
            <button type="button" className="btn" onClick={() => { navigator.clipboard?.writeText(enlace); setCopiado(true); setTimeout(() => setCopiado(false), 1800); }}>{copiado ? "Copiado" : "Copiar enlace"}</button>
            <a className="btn" href={enlace} target="_blank" rel="noreferrer">Abrir</a>
            {puedeEditar && <button type="button" className="btn" onClick={() => window.confirm("El enlace actual dejará de funcionar. ¿Generar uno nuevo?") && guardar({ nuevoEnlace: true })}>Nuevo enlace</button>}
          </div>
        )}
        {puedeEditar && (
          <div className="ficha-import" style={{ marginTop: 12 }}>
            <label htmlFor="fo-plantilla" className="ficha-import-titulo">Campos del formulario</label>
            <select id="fo-plantilla" value={plantilla} onChange={(e) => setPlantilla(e.target.value)}>
              <option value="">Elige una plantilla…</option>
              {plantillas.map((p) => <option key={p.clave} value={p.clave}>{p.nombre}</option>)}
            </select>
            <button type="button" className="btn" disabled={!plantilla} onClick={() => guardar({ plantilla })}>Usar esta plantilla</button>
          </div>
        )}
        {error && <div className="modal-error" style={{ marginTop: 8 }}>{error}</div>}
        <h3 className="ficha-subtitulo">Lo que pregunta</h3>
        <ul className="ficha-campos">
          <li>Nombre completo, documento y área <span className="muted">(siempre)</span></li>
          {act.formularioCampos.map((c) => (
            <li key={c.clave}>{c.etiqueta}{c.obligatorio ? " *" : ""} <span className="muted">· {c.tipo}{c.sensible ? " · dato sensible" : ""}</span></li>
          ))}
          <li>Observaciones y autorización de tratamiento de datos <span className="muted">(siempre)</span></li>
        </ul>
      </section>
    </div>
  );
}

// ---------- Cierre ----------
