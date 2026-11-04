"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { fmtCOP } from "@/lib/format";
import { fetchActividadApi, fetchParticipantesApi } from "@/lib/api";
import ComparaPresupuesto from "@/components/bienestar/ComparaPresupuesto";
import { Estrellas, AnalisisDeActividad } from "@/components/bienestar/CalificacionActividad";
import ObservacionesActividad from "@/components/bienestar/ObservacionesActividad";
import FotosEnChat from "@/components/FotosEnChat";
import { EsqueletoFicha } from "@/components/bienestar/Esqueletos";
import { estadoActividad, rangoHumano, diasDeActividad } from "@/components/bienestar/actividadesUi";
import { crossfade } from "@/lib/crossfade";

const PAGE_SIZES = [10, 25, 50, 100];
const entero = (v) => Math.round(v || 0).toLocaleString("es-CO");
const pct = (v) => (v == null ? "—" : `${(Math.round(v * 1000) / 10).toString().replace(".", ",")} %`);
const VISTAS = [["si", "Asistieron"], ["no", "No asistieron"], ["sin", "Sin registrar"]];
const cuadra = { si: (p) => p.asistio === true, no: (p) => p.asistio === false, sin: (p) => p.asistio == null };

function Tarjeta({ titulo, children }) {
  return <div className="detalle-kpi"><span className="detalle-kpi-titulo">{titulo}</span>{children}</div>;
}

// Mini dashboard de una actividad, al hacer clic en ella en el cronograma: presupuesto y gasto, programados contra
// asistentes, quién fue, por qué no fueron los demás, calificación y el análisis de Nova. Va en pestañas para que cada
// parte quepa sin bajar por todo el modal.
export default function DetalleActividadModal({ actividad: resumen, fichaHref, editarHref, onClose, tabInicial = "resumen" }) {
  const [act, setAct] = useState(null);
  const [personas, setPersonas] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState(tabInicial);
  const [vista, setVista] = useState("si");
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
  const [page, setPage] = useState(1);
  const [areaSize, setAreaSize] = useState(PAGE_SIZES[0]);
  const [areaPage, setAreaPage] = useState(1);
  const cerrar = useRef(null);

  const cargar = useCallback(() => {
    fetchActividadApi(resumen.id).then((r) => setAct(r.actividad)).catch((e) => setError(e.message || "No se pudo cargar la actividad."));
  }, [resumen.id]);
  useEffect(() => {
    cargar();
    fetchParticipantesApi(resumen.id).then((r) => setPersonas(r.participantes)).catch(() => setPersonas([]));
  }, [cargar, resumen.id]);
  useEffect(() => {
    cerrar.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  useEffect(() => { setPage(1); }, [vista, pageSize]);

  const filas = useMemo(() => (personas || []).filter(cuadra[vista]), [personas, vista]);
  const totalPages = Math.max(1, Math.ceil(filas.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filas.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const a = act || resumen;
  const est = estadoActividad(a.estado);
  const p = act?.participacion;
  const inscritos = p?.inscritos || a.inscritos || 0;
  const asistieron = p?.asistieron || a.asistentes || 0;
  const noFueron = p?.noAsistieron || 0;
  // De mayor a menor participación; a igual porcentaje, primero el área con más inscritos.
  const participacionDe = (x) => (x.inscritos ? x.asistieron / x.inscritos : -1);
  const areas = [...(p?.porArea || [])].sort((x, y) => participacionDe(y) - participacionDe(x) || y.inscritos - x.inscritos);
  const areaTotal = Math.max(1, Math.ceil(areas.length / areaSize));
  const areaActual = Math.min(areaPage, areaTotal);
  const areasPagina = areas.slice((areaActual - 1) * areaSize, areaActual * areaSize);

  return (
    <div className="modal-overlay detalle-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal detalle-modal tray-c-${a.estado}${a.linea === "Fundación" ? " tray-fundacion" : ""}`} role="dialog" aria-modal="true" aria-labelledby="det-titulo">
        <header className="detalle-cabeza">
          <div>
            <h2 id="det-titulo">{a.nombre}</h2>
            <p>
              <span className={`pill ${est.pill}`}>{est.label}</span>
              {rangoHumano(a)}{a.fechaFin ? ` · ${diasDeActividad(a)} días` : ""} · {a.linea} · Responsable: {a.responsableNombre || "sin asignar"}
            </p>
            {a.descripcion && <p className="detalle-desc">{a.descripcion}</p>}
          </div>
          <button ref={cerrar} type="button" className="btn-ghost icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
        </header>

        {act && (
          <div className="dash-tabs detalle-tabs" role="tablist" aria-label="Secciones de la actividad">
            {[
              ["resumen", "Resumen"],
              ...(act.aplicaParticipantes ? [["participacion", "Participación por área"], ["quien", `Quién fue (${entero(asistieron)})`]] : []),
              ["comentarios", `Comentarios y observaciones (${entero(act.totalObservaciones)})`],
              ["fotos", `Registro fotográfico (${entero(act.fotos)})`],
            ].map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} className="dash-tab" onClick={() => crossfade(() => setTab(k))}>{l}</button>
            ))}
          </div>
        )}

        <div className="detalle-cuerpo">
          {error && <div className="modal-error">{error}</div>}
          {!act && !error && <EsqueletoFicha />}
          {act && tab === "resumen" && (
            <>
              <div className="detalle-kpis">
                <Tarjeta titulo="Presupuesto y gasto">
                  <ComparaPresupuesto presupuesto={act.presupuesto || 0} gastado={act.gastado || 0} />
                  <span className="count-note">{entero(act.compras)} compra(s) asociada(s)</span>
                </Tarjeta>
                {act.aplicaParticipantes ? (
                  <>
                <Tarjeta titulo="Programados y asistentes">
                  <div className="compara-presu">
                    <dl>
                      <div><dt>Programados</dt><dd>{entero(inscritos)}</dd></div>
                      <div><dt>Asistieron</dt><dd>{entero(asistieron)}</dd></div>
                      <div className="diferencia disponible"><dt>Asistencia</dt><dd>{inscritos ? pct(asistieron / inscritos) : "—"}</dd></div>
                    </dl>
                  </div>
                </Tarjeta>
                <Tarjeta titulo="No asistieron">
                  <strong>{entero(noFueron)}</strong>
                  <span className="count-note">{p.motivos[0] ? `Motivo más frecuente: ${p.motivos[0].motivo}` : "Sin motivos registrados"}</span>
                </Tarjeta>
                <Tarjeta titulo="Costo por asistente">
                  <strong>{asistieron && act.gastado ? fmtCOP(act.gastado / asistieron) : "—"}</strong>
                  <span className="count-note">Compras asociadas ÷ asistentes</span>
                </Tarjeta>
                  </>
                ) : (
                  <Tarjeta titulo="Participantes y asistencia">
                    <strong>No aplica</strong>
                    <span className="count-note">Esta actividad no los maneja</span>
                  </Tarjeta>
                )}
                <Tarjeta titulo="Calificación">
                  <div className="detalle-estrellas"><span>Al cerrar</span>{act.calificacion != null ? <Estrellas valor={act.calificacion} /> : <span className="muted">Sin cerrar</span>}</div>
                  <div className="detalle-estrellas"><span>Nova</span>{act.analisisNova?.puntaje != null ? <Estrellas valor={act.analisisNova.puntaje} /> : act.analisisNova ? <span className="muted">Sin datos para calificar</span> : <span className="muted">Sin análisis</span>}</div>
                  {act.aplicaParticipantes && <div className="detalle-estrellas"><span>Asistentes</span>{p.calificaciones ? <strong className="detalle-prom">{p.calificacionPromedio.toFixed(1).replace(".", ",")} / 5</strong> : <span className="muted">Sin datos</span>}</div>}
                </Tarjeta>
              </div>

              <AnalisisDeActividad act={act} puedeEditar={!!editarHref} onCambio={cargar} />
            </>
          )}
          {act && tab === "participacion" && (
              <div className="detalle-indicadores">
                <section className="resumen-card detalle-card" aria-labelledby="det-areas">
                  <h2 id="det-areas">Participación por área</h2>
                  <p className="card-sub">Participación: asistieron ÷ inscritos de cada área.</p>
                  {p.porArea.length ? (
                    <>
                      <div className="table-scroll">
                        <table className="records detalle-numeros">
                          <thead><tr><th className="nombre">Área</th><th className="num">Inscritos</th><th className="num">Asistieron</th><th className="num">No fueron</th><th className="barra">Participación</th></tr></thead>
                          <tbody>
                            {areasPagina.map((x) => {
                              const v = x.inscritos ? x.asistieron / x.inscritos : null;
                              return (
                                <tr key={x.area}>
                                  <td><span className="desc-tooltip-wrap"><span className="desc-text">{x.area}</span><span className="desc-tooltip-bubble">{x.area}</span></span></td>
                                  <td className="num">{entero(x.inscritos)}</td>
                                  <td className="num">{entero(x.asistieron)}</td>
                                  <td className="num">{entero(x.noAsistieron)}</td>
                                  <td><div className="detalle-pct"><div className="mes-medidor-barra"><span className="asistencia" style={{ width: `${Math.min(100, (v || 0) * 100)}%` }} /></div><b>{pct(v)}</b></div></td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <div className="table-footer">
                        <div className="field" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <label htmlFor="det-area-size" style={{ marginBottom: 0 }}>Tamaño</label>
                          <select id="det-area-size" value={areaSize} onChange={(e) => { setAreaSize(Number(e.target.value)); setAreaPage(1); }}>
                            {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
                          </select>
                        </div>
                        <div className="page-btns">
                          <button type="button" className="btn small" disabled={areaActual <= 1} onClick={() => setAreaPage(areaActual - 1)}>Anterior</button>
                          <button type="button" className="btn small" disabled={areaActual >= areaTotal} onClick={() => setAreaPage(areaActual + 1)}>Siguiente</button>
                        </div>
                        <span className="count-note">Página {areaActual} de {areaTotal}</span>
                        <div className="spacer" />
                        <span className="count-note">{entero(p.porArea.length)} área(s)</span>
                      </div>
                    </>
                  ) : <p className="count-note">Aún no hay participantes registrados.</p>}
                </section>
                <section className="resumen-card detalle-card" aria-labelledby="det-motivos">
                  <h2 id="det-motivos">Motivos de no participación</h2>
                  <p className="card-sub">{entero(noFueron)} persona(s) no asistieron{p.sinRegistrar ? ` · a ${entero(p.sinRegistrar)} aún no se les registra la asistencia` : ""}.</p>
                  {p.motivos.length ? (
                    <div className="table-scroll">
                      <table className="records detalle-numeros">
                        <thead><tr><th className="nombre">Motivo</th><th className="num">Personas</th><th className="barra">Porcentaje</th></tr></thead>
                        <tbody>
                          {p.motivos.map((m) => {
                            const v = noFueron ? m.n / noFueron : null;
                            return (
                              <tr key={m.motivo}>
                                <td><span className="desc-tooltip-wrap"><span className="desc-text">{m.motivo}</span><span className="desc-tooltip-bubble">{m.motivo}</span></span></td>
                                <td className="num">{entero(m.n)}</td>
                                <td><div className="detalle-pct"><div className="mes-medidor-barra"><span className="motivo" style={{ width: `${(v || 0) * 100}%` }} /></div><b>{pct(v)}</b></div></td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : <p className="count-note">Nadie registrado como ausente.</p>}
                </section>
              </div>
          )}
          {act && tab === "quien" && (
              <section className="resumen-card" aria-labelledby="det-quien">
                <div className="resumen-card-head">
                  <h2 id="det-quien">Quién fue</h2>
                  <div className="dash-tabs" role="tablist" aria-label="Asistencia">
                    {VISTAS.map(([k, l]) => (
                      <button key={k} type="button" role="tab" aria-selected={vista === k} className="dash-tab" onClick={() => crossfade(() => setVista(k))}>
                        {l} ({entero((personas || []).filter(cuadra[k]).length)})
                      </button>
                    ))}
                  </div>
                </div>
                <div className="table-scroll">
                  <table className="records detalle-tabla">
                    <thead><tr><th>Nombre</th><th>Área</th>{vista === "no" && <th>Motivo</th>}<th className="num">Calificación</th></tr></thead>
                    <tbody>
                      {personas === null && <tr><td colSpan={4}><div className="skeleton-bar" style={{ height: 34, borderRadius: 8 }} /></td></tr>}
                      {personas !== null && pageRows.length === 0 && <tr><td colSpan={4}><div className="empty">No hay personas en este grupo.</div></td></tr>}
                      {pageRows.map((x) => (
                        <tr key={x.id}>
                          <td><span className="desc-tooltip-wrap"><span className="desc-text">{x.nombre}</span><span className="desc-tooltip-bubble">{x.nombre}</span></span></td>
                          <td className="truncate">{x.area || "—"}</td>
                          {vista === "no" && <td className="truncate">{x.motivoInasistencia || "Sin motivo"}</td>}
                          <td className="num">{x.calificacion ? `${x.calificacion} ★` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="table-footer">
                  <div className="field" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <label htmlFor="det-pagesize" style={{ marginBottom: 0 }}>Tamaño</label>
                    <select id="det-pagesize" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
                      {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                  <div className="page-btns">
                    <button type="button" className="btn small" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Anterior</button>
                    <button type="button" className="btn small" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>Siguiente</button>
                  </div>
                  <span className="count-note">Página {currentPage} de {totalPages}</span>
                  <div className="spacer" />
                  <span className="count-note">{entero(filas.length)} persona(s)</span>
                </div>
              </section>
          )}
          {act && tab === "comentarios" && <ObservacionesActividad act={act} enModal />}
          {act && tab === "fotos" && (
            <section className="resumen-card" aria-label="Registro fotográfico">
              <FotosEnChat spec={{ actividadId: act.id }} grande />
            </section>
          )}
        </div>

        <footer className="modal-foot">
          <Link className="btn btn-primary" href={fichaHref(a)}>Ver ficha completa</Link>
          {editarHref && a.estado !== "cerrada" && <Link className="btn" href={editarHref(a)}>Editar</Link>}
          <button type="button" className="btn" onClick={onClose}>Cerrar</button>
        </footer>
      </div>
    </div>
  );
}
