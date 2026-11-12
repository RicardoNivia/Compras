"use client";

import BotonExcel from "@/components/BotonExcel";
import { fetchParticipacionPorAreaApi } from "@/lib/api";
import NuevaActividadModal from "@/components/bienestar/NuevaActividadModal";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fmtCOP } from "@/lib/format";
import { IconPlus, IconTrash } from "@/components/icons";
import EliminarActividadModal from "@/components/bienestar/EliminarActividadModal";
import CronogramaView from "@/components/bienestar/CronogramaView";
import ResumenBienestar from "@/components/bienestar/ResumenBienestar";
import ResumenFundacion from "@/components/bienestar/ResumenFundacion";
import AgenteEvaluacion from "@/components/bienestar/AgenteEvaluacion";
import DetalleActividadModal from "@/components/bienestar/DetalleActividadModal";
import { Estrellas, CalificacionModal } from "@/components/bienestar/CalificacionActividad";
import { ESTADOS_ACTIVIDAD, estadoActividad, pctClase, rangoFechas } from "@/components/bienestar/actividadesUi";

const PAGE_SIZES = [25, 50, 100];

// Módulo de Bienestar, una vista por página del menú del módulo: "resumen" (/bienestar, participación cruzada con el
// gasto de Compras), "actividades" (/bienestar/actividades, la tabla donde se registran, como Registros para las
// compras) y "cronograma" (/bienestar/cronograma, anual/mensual). El gasto de cada actividad sale de las compras que
// se le asocian (desde aquí o desde el formulario de Compras).
// linea: "Bienestar" o "Fundación" — cada línea tiene sus propias páginas y solo ve sus actividades (la página ya
// las trae filtradas por línea).
export default function BienestarView({ vista = "resumen", linea = "Bienestar", initialActividades = [], puedeEditar }) {
  const basePath = linea === "Fundación" ? "/bienestar/fundacion" : "/bienestar";
  const fichaDe = (id) => `${basePath}/actividades/${id}`;
  const router = useRouter();
  const actividades = initialActividades;
  const [verCalificacion, setVerCalificacion] = useState(null); // id de la actividad
  const [eliminar, setEliminar] = useState(null); // actividad a eliminar (modal de confirmación)
  const [comentarioDe, setComentarioDe] = useState(null); // actividad de un comentario destacado del Resumen

  const anios = useMemo(() => {
    const set = new Set(actividades.filter((a) => a.fecha).map((a) => Number(a.fecha.slice(0, 4))));
    set.add(new Date().getFullYear());
    return [...set].sort((a, b) => b - a);
  }, [actividades]);
  const [anio, setAnio] = useState(new Date().getFullYear());

  // Filtros de la tabla
  const [search, setSearch] = useState("");
  const [estado, setEstado] = useState("");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);

  // Filtro "Área" del cronograma: el área es la de los participantes (las actividades no tienen área propia). Con un
  // área elegida quedan solo las actividades donde hubo gente de esa área, y sus inscritos y asistentes son los de ella.
  const [area, setArea] = useState("");
  const [porArea, setPorArea] = useState({ areas: [], porArea: {} });
  useEffect(() => {
    if (vista !== "cronograma") return undefined;
    let vigente = true;
    fetchParticipacionPorAreaApi(anio, linea).then((r) => { if (vigente) setPorArea(r); }).catch(() => { if (vigente) setPorArea({ areas: [], porArea: {} }); });
    return () => { vigente = false; };
  }, [vista, anio, linea]);
  const areaActiva = porArea.areas.includes(area) ? area : "";

  const delAnio = useMemo(() => {
    const lista = actividades.filter((a) => (a.fecha ? a.fecha.startsWith(`${anio}-`) : anio === new Date().getFullYear()));
    if (!areaActiva) return lista;
    const deArea = porArea.porArea[areaActiva] || {};
    return lista.filter((a) => deArea[a.id]).map((a) => ({ ...a, inscritos: deArea[a.id].inscritos, asistentes: deArea[a.id].asistentes }));
  }, [actividades, anio, areaActiva, porArea]);

  const filtradas = useMemo(() => {
    const q = search.trim().toLowerCase();
    return delAnio
      .filter((a) => !estado || a.estado === estado)
      .filter((a) => !q || [a.nombre, a.descripcion, a.responsableNombre, a.observaciones].some((v) => v && v.toLowerCase().includes(q)))
      .sort((a, b) => (a.fecha || "9999").localeCompare(b.fecha || "9999") || a.nombre.localeCompare(b.nombre));
  }, [delAnio, estado, search]);

  useEffect(() => { setPage(1); }, [search, estado, anio, pageSize]);
  const totalPages = Math.max(1, Math.ceil(filtradas.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtradas.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const resumen = useMemo(() => {
    const presupuesto = delAnio.reduce((s, a) => s + (a.presupuesto || 0), 0);
    const gastado = delAnio.reduce((s, a) => s + (a.gastado || 0), 0);
    const gastadoConPresupuesto = delAnio.filter((a) => a.presupuesto).reduce((s, a) => s + (a.gastado || 0), 0);
    const asistentes = delAnio.reduce((s, a) => s + (a.asistentes || 0), 0);
    const porEstado = Object.fromEntries(ESTADOS_ACTIVIDAD.map((e) => [e.value, delAnio.filter((a) => a.estado === e.value).length]));
    const sinPresupuesto = delAnio.filter((a) => a.estado !== "cerrada" && !a.presupuesto).length;
    return { presupuesto, gastado, gastadoConPresupuesto, asistentes, porEstado, sinPresupuesto };
  }, [delAnio]);

  // Crear una actividad: un modal que solo pregunta el nombre; al guardar se abre su página para completar lo demás.
  const [nueva, setNueva] = useState(null); // null = cerrado; { fecha } = abierto (fecha si viene de un día del cronograma)
  const botonNueva = puedeEditar && (
    <button type="button" className="btn btn-primary bienestar-add" onClick={() => setNueva({ fecha: "" })}><IconPlus size={13} /> Nueva actividad</button>
  );

  const indicadores = (
    <div className="bienestar-kpis">
        <div className="bienestar-kpi">
          <span className="bienestar-kpi-label">Actividades {anio}</span>
          <span className="bienestar-kpi-value">{delAnio.length}</span>
          <span className="count-note">
            {ESTADOS_ACTIVIDAD.map((e) => `${resumen.porEstado[e.value]} ${e.label.toLowerCase()}${resumen.porEstado[e.value] === 1 ? "" : "s"}`).join(" · ")}
          </span>
        </div>
        <div className="bienestar-kpi">
          <span className="bienestar-kpi-label">Presupuesto asignado</span>
          <span className="bienestar-kpi-value">{fmtCOP(resumen.presupuesto)}</span>
          <span className="count-note">{resumen.sinPresupuesto} actividad(es) sin presupuesto</span>
        </div>
        <div className="bienestar-kpi">
          <span className="bienestar-kpi-label">Gastado en compras asociadas</span>
          <span className="bienestar-kpi-value">{fmtCOP(resumen.gastado)}</span>
          <span className="count-note">
            {resumen.gastado ? `${fmtCOP(resumen.gastadoConPresupuesto)} en actividades con presupuesto` : "Asocia las compras desde Registros"}
          </span>
        </div>
        <div className="bienestar-kpi">
          <span className="bienestar-kpi-label">Asistentes</span>
          <span className="bienestar-kpi-value">{resumen.asistentes.toLocaleString("es-CO")}</span>
          <span className="count-note">
            {resumen.asistentes && resumen.gastado ? `${fmtCOP(resumen.gastado / resumen.asistentes)} por asistente` : "Suma de las actividades del año"}
          </span>
        </div>
    </div>
  );

  return (
    <div className={`bienestar${vista === "resumen" ? " dashboard-shell" : ""}`}>
      {vista === "actividades" && (
        <div className="bienestar-head">
          <div className="field bienestar-anio">
            <label htmlFor="bien-anio">Año</label>
            <select id="bien-anio" value={anio} onChange={(e) => setAnio(Number(e.target.value))}>
              {anios.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="spacer" />
          {puedeEditar && <AgenteEvaluacion />}
          {botonNueva}
        </div>
      )}


      {vista === "actividades" && indicadores}

      {comentarioDe && (
        <DetalleActividadModal
          actividad={{ id: comentarioDe.actividadId, nombre: comentarioDe.actividad, fecha: comentarioDe.fecha, fechaFin: comentarioDe.fechaFin, estado: comentarioDe.estado, linea: comentarioDe.linea }}
          tabInicial="comentarios"
          fichaHref={(a) => fichaDe(a.id)}
          editarHref={puedeEditar ? (a) => `${fichaDe(a.id)}?tab=datos` : null}
          onClose={() => setComentarioDe(null)}
        />
      )}

      {vista === "resumen" && linea === "Fundación" ? (
        <ResumenFundacion
          anio={anio}
          anios={anios}
          onAnio={setAnio}
          puedeEditar={puedeEditar}
          accion={botonNueva}
          onAbrirActividad={(id) => router.push(fichaDe(id))}
          onAbrirComentario={(c) => setComentarioDe(c)}
          onVerActividades={() => router.push(`${basePath}/actividades`)}
        />
      ) : vista === "resumen" ? (
        <ResumenBienestar
          anio={anio}
          anios={anios}
          onAnio={setAnio}
          puedeEditar={puedeEditar}
          accion={botonNueva}
          onAbrirActividad={(id) => router.push(fichaDe(id))}
          onAbrirComentario={(c) => setComentarioDe(c)}
          linea={linea}
          onVerActividades={() => router.push(`${basePath}/actividades`)}
        />
      ) : vista === "cronograma" ? (
        <CronogramaView
          anio={anio}
          actividades={delAnio}
          onAbrir={(a) => router.push(fichaDe(a.id))}
          onNueva={puedeEditar ? (fecha) => setNueva({ fecha: fecha || "" }) : null}
          fichaHref={(a) => fichaDe(a.id)}
          linea={linea}
          indicadores={indicadores}
          selectorAnio={(
            <>
              <label className="cronograma-selector-anio">
                Año
                <select value={anio} onChange={(e) => setAnio(Number(e.target.value))}>
                  {anios.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </label>
              <label className="cronograma-selector-anio" title="Área de los participantes: muestra las actividades donde hubo personas de esa área, con sus inscritos y asistentes">
                Área
                <select value={areaActiva} onChange={(e) => setArea(e.target.value)} disabled={porArea.areas.length === 0}>
                  <option value="">{porArea.areas.length ? "Todas" : "Sin participantes"}</option>
                  {porArea.areas.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </label>
              {areaActiva && <span className="count-note">Participación de {areaActiva}: {delAnio.length} actividad(es). Presupuesto y gasto son de toda la actividad.</span>}
            </>
          )}
          accion={botonNueva}
          editarHref={puedeEditar ? (a) => `${fichaDe(a.id)}?tab=datos` : null}
        />
      ) : (
        <>
          <div className="toolbar" style={{ flexWrap: "wrap", gap: 10 }}>
            <div className="field search-field">
              <label htmlFor="bien-search">Buscar</label>
              <input id="bien-search" type="search" placeholder="Nombre, responsable, descripción…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="bien-estado">Estado</label>
              <select id="bien-estado" value={estado} onChange={(e) => setEstado(e.target.value)}>
                <option value="">Todos</option>
                {ESTADOS_ACTIVIDAD.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div className="filter-actions">
              <button type="button" className="btn" onClick={() => { setSearch(""); setEstado(""); }}>Limpiar filtros</button>
            </div>
          </div>

          <div className="table-card">
            <div className="table-scroll">
              <table className="records bienestar-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Actividad</th>
                    <th>Estado</th>
                    <th>Responsable</th>
                    <th className="num">Inscritos</th>
                    <th className="num">Asistentes</th>
                    <th className="num">Presupuesto</th>
                    <th className="num">Compras</th>
                    <th className="num">Gastado</th>
                    <th>Calificación</th>
                    <th className="actions-col">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.length === 0 && (
                    <tr>
                      <td colSpan={11}><div className="empty">No hay actividades que coincidan con los filtros.</div></td>
                    </tr>
                  )}
                  {pageRows.map((a) => {
                    const est = estadoActividad(a.estado);
                    return (
                      <tr key={a.id}>
                        <td className="mono">{rangoFechas(a)}</td>
                        <td>
                          <Link href={fichaDe(a.id)} className="desc-tooltip-wrap ficha-link">
                            <span className="desc-text">{a.nombre}</span>
                            <span className="desc-tooltip-bubble">{a.nombre}{a.descripcion ? ` — ${a.descripcion}` : ""}</span>
                          </Link>
                        </td>
                        <td><span className={`pill ${est.pill}`}>{est.label}</span></td>
                        <td className="truncate">{a.responsableNombre || "—"}</td>
                        <td className="num">{a.aplicaParticipantes ? a.inscritos ?? "—" : <span className="muted">No aplica</span>}</td>
                        <td className="num">{a.aplicaParticipantes ? a.asistentes ?? "—" : <span className="muted">No aplica</span>}</td>
                        <td className="num">{a.presupuesto != null ? fmtCOP(a.presupuesto) : <span className="muted">Sin asignar</span>}</td>
                        <td className="num">{a.compras || "—"}</td>
                        <td className="num">
                          {a.gastado ? fmtCOP(a.gastado) : "—"}
                          {a.pctPresupuesto != null && a.gastado > 0 && (
                            <span className={`pill ${pctClase(a.pctPresupuesto)}`} style={{ marginLeft: 6 }}>{Math.round(a.pctPresupuesto * 100)} %</span>
                          )}
                        </td>
                        <td>
                          {a.calificacion != null || a.puntajeNova != null ? (
                            <button type="button" className="tabla-calificacion" onClick={() => setVerCalificacion(a.id)} title="Ver la calificación y el análisis de Nova">
                              <Estrellas valor={a.calificacion ?? a.puntajeNova} />
                            </button>
                          ) : <span className="muted">—</span>}
                        </td>
                        <td className="actions-cell">
                          <div className="row-actions">
                            {/* Un solo botón: la actividad se ve y se edita en la misma página. */}
                            <Link href={fichaDe(a.id)} className="btn small" title={puedeEditar && a.estado !== "cerrada" ? "Ver y gestionar la actividad" : "Ver la actividad"}>Abrir</Link>
                            {puedeEditar && a.estado !== "cerrada" && (
                              <button type="button" className="btn small btn-danger-outline icon-btn" title="Eliminar la actividad" aria-label={`Eliminar ${a.nombre}`} onClick={() => setEliminar(a)}>
                                <IconTrash size={13} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="table-footer">
              <div className="field" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <label htmlFor="bien-pagesize" style={{ marginBottom: 0 }}>Tamaño</label>
                <select id="bien-pagesize" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
                  {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div className="page-btns">
                <button type="button" className="btn small" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Anterior</button>
                <button type="button" className="btn small" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>Siguiente</button>
              </div>
              <span className="count-note">Página {currentPage} de {totalPages}</span>
              <div className="spacer" />
              <BotonExcel nombre={`actividades-${anio}`} hoja="Actividades" filas={filtradas} deshabilitado={!filtradas.length} columnas={[
                { t: "Fecha", v: (a) => rangoFechas(a) }, { t: "Actividad", v: (a) => a.nombre }, { t: "Descripción", v: (a) => a.descripcion },
                { t: "Estado", v: (a) => estadoActividad(a.estado).label }, { t: "Responsable", v: (a) => a.responsableNombre },
                { t: "Inscritos", v: (a) => (a.aplicaParticipantes ? a.inscritos ?? null : "No aplica") }, { t: "Asistentes", v: (a) => (a.aplicaParticipantes ? a.asistentes ?? null : "No aplica") },
                { t: "Presupuesto ($)", v: (a) => a.presupuesto }, { t: "Compras", v: (a) => a.compras || 0 }, { t: "Gastado ($)", v: (a) => a.gastado || 0 },
                { t: "% del presupuesto", v: (a) => (a.pctPresupuesto != null ? Math.round(a.pctPresupuesto * 100) : null) }, { t: "Calificación", v: (a) => a.calificacion ?? a.puntajeNova ?? null },
              ]} />
              <span className="count-note">{filtradas.length} actividad(es) (de {delAnio.length} en {anio})</span>
            </div>
          </div>
        </>
      )}
      {nueva && <NuevaActividadModal linea={linea} fecha={nueva.fecha} basePath={basePath} onClose={() => setNueva(null)} />}
      {eliminar && <EliminarActividadModal act={eliminar} onClose={() => setEliminar(null)} onEliminada={() => { setEliminar(null); router.refresh(); }} />}
      {verCalificacion != null && <CalificacionModal actividadId={verCalificacion} puedeEditar={puedeEditar} onClose={() => setVerCalificacion(null)} onCambio={() => router.refresh()} />}
    </div>
  );
}
