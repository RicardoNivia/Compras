"use client";

import { useConfirmar } from "@/components/Confirmar";
import { normalizar } from "@/lib/buscar";
import BotonExcel from "@/components/BotonExcel";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { fmtCOP, fmtDateTime } from "@/lib/format";
import {
  fetchActividadApi, updateActividadApi, fetchParticipantesApi, actualizarParticipanteApi, eliminarParticipanteApi, eliminarTodosLosParticipantesApi,
  crearParticipanteApi, fetchInventarioApi, generarAnalisisActividadApi, fetchMaestroTipoApi, crearItemApi,
  actualizarItemApi, eliminarItemApi, importarInventarioApi, fetchPlantillasFormularioApi, configurarFormularioApi,
  asociarCompraApi, desasociarCompraApi, salidaBodegaApi,
} from "@/lib/api";
import ActividadFormulario from "@/components/bienestar/ActividadFormulario";
import AsociarComprasPanel from "@/components/bienestar/AsociarComprasPanel";
import { AnimatedNumber } from "@/components/charts/chartKit";
import HBarChartSvg from "@/components/charts/HBarChartSvg";
import ImportarNovaModal from "@/components/bienestar/ImportarNovaModal";
import CerrarActividadModal, { razonParaNoCerrar } from "@/components/bienestar/CerrarActividadModal";
import ReabrirActividadModal from "@/components/bienestar/ReabrirActividadModal";
import PiePagina, { usePagina } from "@/components/bienestar/PiePagina";
import SolicitudesActividad from "@/components/bienestar/SolicitudesActividad";
import { EsqueletoFicha, EsqueletoTabla } from "@/components/bienestar/Esqueletos";
import { Estrellas, CalificacionModal, TabCalificaciones } from "@/components/bienestar/CalificacionActividad";
import FotosActividad from "@/components/bienestar/FotosActividad";
import ObservacionesActividad from "@/components/bienestar/ObservacionesActividad";
import AgenteImportacion from "@/components/bienestar/AgenteImportacion";
import SacarDeBodega from "@/components/bienestar/SacarDeBodega";
import { ComentarioConMano } from "@/components/bienestar/Sentimiento";
import {
  IconPlus, IconTrash, IconDownload, IconCheck, IconDashboard, IconEdit, IconMoney, IconBag, IconUsers, IconMano,
  IconLayers, IconEye, IconStar, IconSpark,
} from "@/components/icons";
import { ESTADOS_ACTIVIDAD, estadoActividad, pctClase, rangoFechas } from "@/components/bienestar/actividadesUi";
import { crossfade } from "@/lib/crossfade";
import MoneyInput from "@/components/MoneyInput";

const PAGE_SIZES = [25, 50, 100];
const entero = (v) => Math.round(v).toLocaleString("es-CO");
const pct = (v) => (v == null ? "—" : `${(Math.round(v * 1000) / 10).toString().replace(".", ",")} %`);

// Ficha de una actividad de Bienestar: todo su detalle para ir desglosando — presupuesto contra gasto, inscritos y
// quiénes no asistieron (con su motivo), participación por área, inventario (qué se usó y qué quedó), compras,
// formulario público de inscripción y el cierre con calificación.
// Diseño: arriba, la cabecera con el ciclo de la actividad (creada → programada → ejecutada → cerrada) y cuatro
// medidores (presupuesto, compras, asistencia, calificación) que llevan a su sección; abajo, un menú lateral con las
// secciones agrupadas por tema (La actividad · Dinero · Personas · Registro · Cierre) y el contenido a la derecha.
// Es la ÚNICA página de la actividad: aquí se ve y aquí mismo se configura (antes había una página "Editar" aparte).
// Cada pestaña junta lo que se configura con lo que se ve de ese tema: Datos de la actividad (nombre, fechas, estado,
// responsable) · Presupuesto (cuánto se asigna y en qué va) · Compras (asociar, quitar, solicitar) · Participantes y asistencia (si
// aplica, los totales o la lista con su importación). Las partes editables son el mismo ActividadFormulario, incrustado.
const TABS_VALIDAS = ["resumen", "datos", "presupuesto", "compras", "participantes", "observaciones", "inventario", "fotos", "calificaciones", "agente"];
export default function FichaActividad({ actividadId, puedeEditar, puedeUsarBodega = false, basePath, responsables = [], lineasPermitidas }) {
  const { confirmar } = useConfirmar();
  const [act, setAct] = useState(null);
  const [error, setError] = useState("");
  // ?tab= abre directo en una pestaña (los enlaces viejos a /editar llegan con tab=datos; al cerrar, calificaciones).
  const tabPedida = useSearchParams().get("tab");
  const [tab, setTab] = useState(TABS_VALIDAS.includes(tabPedida) ? tabPedida : "resumen");
  const sucio = useRef(false); // hay cambios sin guardar en la sección editable de la pestaña
  const [guardado, setGuardado] = useState(false);
  const [verConfig, setVerConfig] = useState(false); // configuración de la asistencia desplegada
  useEffect(() => {
    if (!guardado) return undefined;
    const t = setTimeout(() => setGuardado(false), 3500);
    return () => clearTimeout(t);
  }, [guardado]);
  async function cambiarTab(k) {
    if (k === tab) return;
    if (sucio.current && !(await confirmar({ titulo: "Cambios sin guardar", mensaje: "Tienes cambios sin guardar en esta sección. ¿Salir sin guardarlos?", boton: "Salir sin guardar", peligro: true }))) return;
    sucio.current = false;
    crossfade(() => setTab(k));
  }
  const [cerrar, setCerrar] = useState(false);
  const [reabrir, setReabrir] = useState(false);
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
  // La parte editable de una pestaña. La clave cambia con lo que se guarda o se importa, así el formulario siempre
  // arranca de los datos vigentes (p. ej. los conteos después de importar la asistencia).
  const formulario = (secciones, extra = {}) => (
    <ActividadFormulario
      key={`${secciones.join()}|${act.updatedAt}|${act.inscritos}|${act.asistentes}|${act.presupuesto}|${act.compras}`}
      embebido
      secciones={secciones}
      actividad={act}
      responsables={responsables}
      lineasPermitidas={lineasPermitidas}
      puedeEditar={puedeEditar && !cerrada}
      basePath={basePath}
      onGuardado={() => { setGuardado(true); cargar(); }}
      onSucio={(s) => { sucio.current = s; }}
      {...extra}
    />
  );

  // ---- Lo que arma la página ----
  const asistieronN = p.total ? p.asistieron : act.asistentes || 0;
  const inscritosN = p.inscritos || act.inscritos || 0;
  const costoAsistente = asistieronN && act.gastado ? act.gastado / asistieronN : null;
  const iEstado = ESTADOS_ACTIVIDAD.findIndex((x) => x.value === act.estado);
  const cuenta = (n) => (n ? String(n) : null);
  // Las secciones, agrupadas por tema (antes eran once pestañas en dos filas). [clave, nombre, ícono, contador, aviso]
  const grupos = [
    { titulo: "La actividad", items: [["resumen", "Resumen", IconDashboard], ["datos", "Datos de la actividad", IconEdit]] },
    { titulo: "Dinero", items: [["presupuesto", "Presupuesto", IconMoney, !act.presupuestoConfigurado && !cerrada ? "Falta" : null, true], ["compras", "Compras", IconBag, cuenta(act.compras)]] },
    {
      titulo: "Personas",
      items: [
        ["participantes", "Participantes y asistencia", IconUsers, act.aplicaParticipantes ? cuenta(p.total) : null],
        ["observaciones", "Encuesta y observaciones", IconMano, cuenta(act.totalObservaciones)],
        // "Formulario de inscripción" está oculto (noviembre 2026). TabFormulario, la ruta pública /inscripcion/<token> y el
        // backend siguen existiendo; para mostrarlo de nuevo, descomentar esta línea y devolver "formulario" a TABS_VALIDAS:
        // ...(act.aplicaParticipantes ? [["formulario", "Formulario de inscripción", IconFile, act.formularioAbierto ? "Abierto" : null]] : []),
      ],
    },
    { titulo: "Registro", items: [["inventario", "Inventario", IconLayers, cuenta(act.inventario.items.length)], ["fotos", "Fotos", IconEye, cuenta(act.fotos)]] },
    { titulo: "Cierre", items: [["calificaciones", "Calificación", IconStar]] },
    ...(puedeEditar && !cerrada ? [{ titulo: "Ayuda de Nova", items: [["agente", "Agente de importación", IconSpark]] }] : []),
  ];
  const seccion = grupos.flatMap((g) => g.items).find((it) => it[0] === tab) || grupos[0].items[0];
  const AYUDA = {
    resumen: "Cómo va la actividad, de un vistazo.",
    datos: "Nombre, fechas, estado y responsable. Guarda al terminar.",
    presupuesto: "Cuánto se le asigna y en qué va el gasto.",
    compras: "Lo que se compra para la actividad: solicitar, asociar o quitar compras.",
    participantes: "Quiénes están inscritos, quién fue, quién no y por qué.",
    observaciones: "Lo que opinaron los participantes y lo que anota el equipo.",
    formulario: "El enlace para que las personas se inscriban solas.",
    inventario: "Qué se llevó, cuánto se usó y qué sobró.",
    fotos: "El registro fotográfico de la actividad.",
    calificaciones: "La calificación de Nova y la del equipo al cerrar.",
    agente: "Sube todos los archivos de la actividad y Nova los reparte.",
  };
  const medidor = (clave, etiqueta, valor, sub, barra) => (
    <button type="button" className={`fx-medidor${tab === clave ? " activo" : ""}`} onClick={() => cambiarTab(clave)} title={`${sub} · clic para ir a ${etiqueta}`}>
      <span className="fx-medidor-et">{etiqueta}</span>
      <strong>{valor}</strong>
      {barra && <span className="fx-barra" aria-hidden="true"><i className={barra.clase} style={{ width: `${Math.max(0, Math.min(100, barra.pct * 100))}%` }} /></span>}
      <small>{sub}</small>
    </button>
  );

  return (
    <div className="ficha fx">
      <header className={`fx-hero${act.linea === "Fundación" ? " af-fundacion" : ""}`}>
        <div className="fx-hero-top">
          <div className="ficha-head-txt">
            <Link href={`${basePath}/actividades`} className="ficha-volver">← Actividades {act.linea === "Fundación" ? "de Fundación" : ""}</Link>
            <h1>{act.nombre}</h1>
            <div className="actividad-chips">
              <span className="actividad-chip">{rangoFechas(act)}</span>
              <span className={`bienestar-linea ${act.linea === "Fundación" ? "fundacion" : ""}`}>{act.linea}</span>
              {!act.enCronograma && <span className="actividad-chip">Fuera del cronograma</span>}
              <span className="actividad-chip">{act.responsableNombre ? `Responsable: ${act.responsableNombre}` : "Sin responsable"}</span>
            </div>
          </div>
          <div className="ficha-head-acciones">
            {(cerrada || act.analisisNova) && (
              <button type="button" className="ficha-cierre" onClick={() => setVerCalificacion(true)} title="Ver la calificación y el análisis de Nova">
                <Estrellas valor={act.calificacion ?? act.analisisNova?.puntaje} />
                {cerrada ? `Cerrada por ${act.cerradaPorNombre || "—"}${act.cerradaAt ? ` · ${fmtDateTime(act.cerradaAt)}` : ""}` : "Análisis de Nova"}
              </button>
            )}
            {puedeEditar && cerrada && (
              <button type="button" className="btn" onClick={() => setReabrir(true)} title="Vuelve a «Ejecutada» para modificarla o eliminarla; queda en Auditoría">
                Reabrir actividad
              </button>
            )}
            {puedeEditar && !cerrada && (
              <button type="button" className="btn btn-primary" onClick={() => setCerrar(true)} disabled={!!razonParaNoCerrar(act)} title={razonParaNoCerrar(act) || "Calificar y cerrar la actividad"}>
                <IconCheck size={13} /> Cerrar actividad
              </button>
            )}
          </div>
        </div>

        {/* En qué va la actividad: creada → programada → ejecutada → cerrada */}
        <ol className="fx-ciclo" aria-label={`Estado de la actividad: ${est.label}`}>
          {ESTADOS_ACTIVIDAD.map((x, i) => (
            <li key={x.value} className={i < iEstado ? "hecho" : i === iEstado ? "actual" : ""} aria-current={i === iEstado ? "step" : undefined}>
              <span className="fx-ciclo-punto">{i < iEstado ? <IconCheck size={11} /> : i + 1}</span>
              {x.label}
            </li>
          ))}
        </ol>

        {/* Cuatro medidores; cada uno lleva a su sección */}
        <div className="fx-medidores">
          {medidor(
            "presupuesto", "Presupuesto",
            act.presupuestoConfigurado ? <><AnimatedNumber value={act.gastado} format={fmtCOP} /> <em>de {fmtCOP(presupuesto)}</em></> : <AnimatedNumber value={act.gastado} format={fmtCOP} />,
            act.presupuestoConfigurado ? `${pct(act.pctPresupuesto)} gastado · disponible ${fmtCOP(disponible)}` : "No configurado: se toma lo acumulado en compras",
            act.pctPresupuesto != null ? { pct: act.pctPresupuesto, clase: pctClase(act.pctPresupuesto) } : null,
          )}
          {medidor(
            "compras", "Compras",
            <><AnimatedNumber value={act.compras} format={entero} /> <em>compra(s)</em></>,
            act.compras ? `${fmtCOP(act.gastado)} en total${costoAsistente ? ` · ${fmtCOP(costoAsistente)} por asistente` : ""}` : "Aún no hay compras asociadas",
          )}
          {act.aplicaParticipantes ? medidor(
            "participantes", "Asistencia",
            <><AnimatedNumber value={asistieronN} format={entero} /> <em>de {entero(inscritosN)} inscritos</em></>,
            `Participación ${pct(asistencia)}${p.noAsistieron ? ` · ${p.noAsistieron} no asistieron${p.motivos[0] ? ` (${p.motivos[0].motivo})` : ""}` : ""}${p.sinRegistrar ? ` · ${p.sinRegistrar} sin registrar` : ""}${!p.total && !inscritosN ? " · sin lista de inscritos" : ""}`,
            asistencia != null ? { pct: asistencia, clase: "good" } : null,
          ) : medidor("participantes", "Asistencia", "No aplica", "Esta actividad no maneja participantes")}
          {medidor(
            "calificaciones", "Calificación",
            <Estrellas valor={act.calificacion ?? act.analisisNova?.puntaje} />,
            p.calificacionPromedio ? `Asistentes: ${p.calificacionPromedio.toFixed(1).replace(".", ",")} / 5 (${p.calificaciones})` : cerrada ? "Calificada al cerrar" : "Sin calificaciones todavía",
          )}
        </div>
      </header>

      <div className="fx-cuerpo">
        <nav className="fx-nav" role="tablist" aria-label="Secciones de la actividad">
          {grupos.map((g) => (
            <div key={g.titulo} className="fx-nav-grupo">
              <span className="fx-nav-titulo">{g.titulo}</span>
              {g.items.map(([k, nombre, Icono, n, aviso]) => (
                <button key={k} type="button" role="tab" aria-selected={tab === k} className="fx-nav-item" onClick={() => cambiarTab(k)}>
                  <Icono size={15} />
                  <span className="fx-nav-nombre">{nombre}</span>
                  {n && <span className={`fx-nav-cuenta${aviso ? " aviso" : ""}`}>{n}</span>}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="fx-contenido">
          <div className="fx-seccion">
            <h2>{seccion[1]}</h2>
            <p>{AYUDA[seccion[0]]}</p>
          </div>

      {tab === "resumen" && <TabResumen act={act} />}
      {tab === "calificaciones" && <TabCalificaciones act={act} puedeEditar={puedeEditar} onCambio={cargar} />}
      {tab === "datos" && formulario(["actividad"])}
      {tab === "presupuesto" && formulario(["presupuesto"])}
      {tab === "compras" && <TabCompras act={act} puedeEditar={puedeEditar} cerrada={cerrada} onCambio={cargar} />}
      {tab === "participantes" && (
        <div className="ficha-unida">
          {act.aplicaParticipantes && <TabParticipantes act={act} puedeEditar={puedeEditar && !cerrada} onCambio={cargar} />}
          {/* La configuración (si aplica participantes, totales a mano, observaciones) va plegada debajo de la lista:
              una sola línea, para que la lista sea lo primero. Solo se abre sola si la actividad no maneja participantes. */}
          <details className="fx-plegable" open={verConfig || !act.aplicaParticipantes} onToggle={(e) => setVerConfig(e.currentTarget.open)}>
            <summary>
              <span>Configuración de la asistencia</span>
              <small>
                {!act.aplicaParticipantes ? "Esta actividad no maneja participantes" : p.total ? "Los totales salen de la lista" : "Sin lista: aquí puedes escribir los totales a mano"}
                {act.observaciones ? " · con observaciones" : ""}
              </small>
            </summary>
            {formulario(["asistencia"], { conLista: p.total > 0 })}
          </details>
        </div>
      )}
      {tab === "observaciones" && <ObservacionesActividad act={act} puedeEditar={puedeEditar && !cerrada} onCambio={cargar} />}
      {tab === "agente" && <AgenteImportacion act={act} onCambio={cargar} />}
      {tab === "inventario" && <TabInventario act={act} puedeEditar={puedeEditar && !cerrada} puedeUsarBodega={puedeUsarBodega} onCambio={cargar} />}
      {tab === "fotos" && <FotosActividad actividadId={act.id} puedeEditar={puedeEditar && !cerrada} onCambio={cargar} />}
      {tab === "formulario" && <TabFormulario act={act} puedeEditar={puedeEditar && !cerrada} onCambio={cargar} />}
        </div>
      </div>

      {guardado && <div className="toast toast-good" role="status"><IconCheck size={13} /> Cambios guardados.</div>}
      {verCalificacion && <CalificacionModal actividadId={act.id} puedeEditar={puedeEditar} onClose={() => setVerCalificacion(false)} onCambio={cargar} />}
      {reabrir && <ReabrirActividadModal act={act} onClose={() => setReabrir(false)} onReabierta={() => { setReabrir(false); setTab("datos"); cargar(); }} />}
      {cerrar && <CerrarActividadModal act={act} onClose={() => setCerrar(false)} onCerrada={() => { setCerrar(false); setTab("calificaciones"); cargar(); }} />}
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
          ) : <div className="empty compacta">Aún no hay participantes registrados.</div>}
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
          <p className="card-sub">{inv.items} ítem(s) usados.</p>
          <div className="actividad-cifras">
            <div><span>Costo de lo usado</span><strong>{fmtCOP(inv.costoTotal)}</strong></div>
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
  const { confirmar } = useConfirmar();
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
    const q = normalizar(search);
    return (lista || []).filter((p) => (!filtro || (filtro === "si" ? p.asistio === true : filtro === "no" ? p.asistio === false : p.asistio === null))
      && (!area || p.area === area)
      && (!q || normalizar(`${p.nombre} ${p.documento || ""} ${p.observacion || ""}`).includes(q)));
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
          <button type="button" className="btn" onClick={exportarCsv}><IconDownload size={13} /> CSV</button>
          {puedeEditar && lista?.length > 0 && (
            <button type="button" className="btn btn-danger-outline" onClick={async () => {
              const conOpinion = lista.filter((x) => x.calificacion != null || x.observacion).length;
              if (!(await confirmar({ titulo: "Eliminar toda la asistencia", mensaje: `¿Borrar la lista completa de «${act.nombre}»? Se eliminan las ${lista.length} persona(s) con su asistencia${conOpinion ? `, y ${conOpinion} calificación(es) o comentario(s)` : ""}.`, detalle: "Solo se borran las calificaciones y comentarios de esas personas. La calificación y el comentario de cierre, las notas del equipo y las observaciones de la actividad no se tocan. No se puede deshacer; puedes volver a importar la lista. Queda en Auditoría.", boton: "Sí, borrar todo", peligro: true }))) return;
              setError("");
              try { await eliminarTodosLosParticipantesApi(act.id); } catch (e) { setError(e.message); }
              cargar(); onCambio();
            }}><IconTrash size={13} /> Eliminar toda la asistencia</button>
          )}
          {puedeEditar && <button type="button" className="btn btn-primary" onClick={() => setNuevo(true)}><IconPlus size={13} /> Agregar persona</button>}
        </div>
      </div>

      {puedeEditar && (
        <div className="importar-tarjetas" aria-label="Importar desde Excel con Nova">
          {/* Un solo archivo, sea cual sea: Nova decide si es la lista de programados, la de quienes fueron o una
              planilla con quién vino, quién no y por qué, y lee la asistencia y el motivo de cada persona. */}
          <label className="importar-tarjeta">
            <input type="file" accept=".xlsx,.xls" className="importar-input" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) { setError(""); setAviso(""); setImportar({ tipo: "lista", archivo: f }); } }} />
            <IconDownload size={15} style={{ transform: "rotate(180deg)" }} />
            <span>
              <strong>Importar participantes y asistencia</strong>
              <span className="count-note">Sube el archivo que tengas: inscritos, lista de asistencia o una planilla con quién vino, quién no y por qué. Nova lo lee, marca a cada persona como asistió o no asistió con su motivo, y te muestra qué va a cargar antes de guardar.</span>
            </span>
          </label>
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
              {pageRows.length === 0 && <tr><td colSpan={9}><div className="empty">{lista.length ? "Nadie coincide con los filtros." : "Aún no hay inscritos. Impórtalos con el botón de arriba o agrégalos uno por uno."}</div></td></tr>}
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
                      {puedeEditar && <button type="button" className="icon-action-btn delete" title="Quitar de la actividad" aria-label={`Quitar a ${pp.nombre}`} onClick={async () => { if (await confirmar({ titulo: "Quitar participante", mensaje: `¿Quitar a ${pp.nombre} de la actividad?`, detalle: "Se borran su asistencia, calificación y comentario en esta actividad.", boton: "Sí, quitar", peligro: true })) { await eliminarParticipanteApi(act.id, pp.id).catch((e) => setError(e.message)); cargar(); onCambio(); } }}><IconTrash size={13} /></button>}
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
          <BotonExcel nombre={`participantes-${act.id}`} hoja="Participantes" filas={filtrados} deshabilitado={!filtrados.length} columnas={[
            { t: "Nombre", v: (pp) => pp.nombre }, { t: "Documento", v: (pp) => pp.documento }, { t: "Área", v: (pp) => pp.area },
            { t: "Asistencia", v: (pp) => (pp.asistio === true ? "Sí" : pp.asistio === false ? "No" : "Sin marcar") }, { t: "Motivo", v: (pp) => pp.motivoInasistencia },
            { t: "Calificación", v: (pp) => pp.calificacion }, { t: "Observación", v: (pp) => pp.observacion }, { t: "Origen", v: (pp) => ({ formulario: "Formulario", importacion: "Excel", manual: "Manual" }[pp.origen] || pp.origen) },
          ]} />
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
function TabInventario({ act, puedeEditar, puedeUsarBodega, onCambio }) {
  const { confirmar } = useConfirmar();
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
  // «Editar cantidad»: en un ítem de la bodega la diferencia sale o vuelve a la bodega (el servidor no deja sacar más de
  // lo que hay ni bajar de lo ya usado); en uno propio de la actividad solo cambia su cantidad.
  const [editarCant, setEditarCant] = useState(null);
  const [cantNueva, setCantNueva] = useState("");
  const [errorCant, setErrorCant] = useState("");
  const [guardandoCant, setGuardandoCant] = useState(false);

  async function confirmarCantidad(e) {
    e.preventDefault();
    setErrorCant("");
    const it = editarCant;
    const n = Number(cantNueva);
    if (!(n > 0)) { setErrorCant("Escribe una cantidad mayor que cero."); return; }
    setGuardandoCant(true);
    try {
      if (it.articuloId) {
        const r = await salidaBodegaApi(act.id, { accion: "cantidad", itemId: it.id, cantidad: Math.floor(n) });
        const d = Math.floor(n) - it.cantidad; // lo que hoy está fuera de la bodega
        setAviso(r.articulo ? `${it.item}: se usaron ${Math.floor(n)}. ${d > 0 ? `Se descontaron ${d} más de la bodega` : `Volvieron ${-d} a la bodega`}; allá quedan ${r.articulo.stock}.` : "La cantidad no cambió.");
      } else {
        await actualizarItemApi(act.id, it.id, { usado: n });
        setAviso(`${it.item}: se usaron ${n}.`);
      }
      setEditarCant(null);
      await recargar();
    } catch (err) {
      setErrorCant(err.message);
    } finally {
      setGuardandoCant(false);
    }
  }

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
        <div><span>Costo de lo usado</span><strong>{fmtCOP(resumen.costoTotal)}</strong></div>
      </div>
      {puedeEditar && puedeUsarBodega && <SacarDeBodega actividadId={act.id} onListo={async (txt) => { setAviso(txt); await recargar(); }} />}
      {puedeEditar && (
        <form className="ficha-import" onSubmit={agregar}>
          <span className="ficha-import-titulo">Agregar ítem que no está en la bodega</span>
          <input aria-label="Ítem" placeholder="Ítem (ej. Refrigerios)" value={nuevo.item} onChange={(e) => setNuevo({ ...nuevo, item: e.target.value })} />
          <input aria-label="Cantidad usada" type="number" min="0" step="any" placeholder="Cantidad usada" value={nuevo.cantidad} onChange={(e) => setNuevo({ ...nuevo, cantidad: e.target.value })} style={{ width: 110 }} />
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
            <span><strong>Importar inventario</strong><span className="count-note">Un Excel con Ítem, Cantidad usada, Unidad y Costo unitario. Los ítems que ya existen se actualizan.</span></span>
          </label>
        </div>
      )}
      {aviso && <div className="ficha-aviso" role="status">{aviso}</div>}
      {error && <div className="modal-error">{error}</div>}
      <div className="table-card">
        <div className="table-scroll">
          <table className="records ficha-tabla">
            <thead><tr><th>Ítem</th><th>Unidad</th><th className="num">Usado</th><th className="num">Costo unit.</th><th className="num">Costo total</th><th className="actions-col">Acciones</th></tr></thead>
            <tbody>
              {pageRows.length === 0 && <tr><td colSpan={6}><div className="empty">Sin inventario. Registra lo usado de la bodega, agrega un ítem o sube un Excel con Ítem, Cantidad usada, Unidad y Costo unitario.</div></td></tr>}
              {pageRows.map((it) => (
                <tr key={it.id}>
                  <td><span className="desc-tooltip-wrap"><span className="desc-text">{it.item}</span><span className="desc-tooltip-bubble">{it.item}</span></span>{it.articuloId && <span className="pill accent inv-de-bodega" title="Salió de la bodega de Bienestar">Bodega</span>}</td>
                  <td>{it.unidad || "—"}</td>
                  <td className="num">{it.usado}</td>
                  <td className="num">{it.costoUnitario != null ? fmtCOP(it.costoUnitario) : "—"}</td>
                  <td className="num">{it.costoTotal != null ? fmtCOP(it.costoTotal) : "—"}</td>
                  <td className="actions-cell"><div className="row-actions">
                    {puedeEditar && (!it.articuloId || puedeUsarBodega) && <button type="button" className="icon-action-btn" aria-label={`Editar la cantidad de ${it.item}`} title="Editar la cantidad usada" onClick={() => { setEditarCant(it); setCantNueva(String(it.usado)); setErrorCant(""); }}><IconEdit size={13} /></button>}
                    {puedeEditar && (!it.articuloId || puedeUsarBodega) && <button type="button" className="icon-action-btn delete" aria-label={`Quitar ${it.item}`} onClick={async () => { if (await confirmar({ titulo: "Quitar del inventario", mensaje: it.articuloId ? `¿Quitar "${it.item}" de la actividad? Las ${it.usado} usadas vuelven a la bodega.` : `¿Quitar "${it.item}" del inventario?`, boton: "Sí, quitar", peligro: true })) { await eliminarItemApi(act.id, it.id).catch((e) => setError(e.message)); recargar(); } }}><IconTrash size={13} /></button>}
                  </div></td>
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
          <BotonExcel nombre={`inventario-actividad-${act.id}`} hoja="Inventario usado" filas={items} deshabilitado={!items.length} columnas={[
            { t: "Ítem", v: (it) => it.item }, { t: "Unidad", v: (it) => it.unidad }, { t: "Usado", v: (it) => it.usado },
            { t: "Costo unitario ($)", v: (it) => it.costoUnitario }, { t: "Costo total ($)", v: (it) => it.costoTotal }, { t: "De la bodega", v: (it) => (it.articuloId ? "Sí" : "No") },
          ]} />
          <span className="count-note">{items.length} ítem(s)</span>
        </div>
        {editarCant && (() => {
          const n = Math.floor(Number(cantNueva) || 0);
          const d = n - editarCant.cantidad;
          return (
            <div className="modal-overlay inv-fondo" onMouseDown={(e) => { if (e.target === e.currentTarget) setEditarCant(null); }}>
              <form className="modal inv-modal" role="dialog" aria-modal="true" aria-labelledby="cant-t" onSubmit={confirmarCantidad} noValidate>
                <div className="modal-head"><div><h3 id="cant-t">Editar la cantidad usada</h3><span className="count-note">{editarCant.item}: hoy se usaron {editarCant.usado}{editarCant.articuloId ? " de la bodega" : ""}.</span></div><button type="button" className="btn-ghost icon-btn" onClick={() => setEditarCant(null)} aria-label="Cerrar">✕</button></div>
                <div className="inv-modal-cuerpo">
                  <div className="field"><label htmlFor="cant-n">Cantidad usada</label><input id="cant-n" type="number" min="1" step={editarCant.articuloId ? "1" : "any"} inputMode="numeric" className="inv-num" value={cantNueva} onChange={(e) => { setCantNueva(e.target.value); setErrorCant(""); }} autoFocus /></div>
                  {editarCant.articuloId && n > 0 && d !== 0 && <span className="count-note">{d > 0 ? `Se descontarán ${d} más de la bodega.` : `Volverán ${-d} a la bodega.`}</span>}
                  {errorCant && <div className="modal-error" role="alert">{errorCant}</div>}
                </div>
                <div className="modal-foot"><button type="submit" className="btn btn-primary" disabled={guardandoCant}>{guardandoCant && <span className="spinner" />} Guardar</button><button type="button" className="btn" onClick={() => setEditarCant(null)}>Cancelar</button></div>
              </form>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ---------- Compras ----------
function TabCompras({ act, puedeEditar, cerrada, onCambio }) {
  const [buscar, setBuscar] = useState("");
  const [error, setError] = useState("");
  const editable = puedeEditar && !cerrada;
  // "Asociar compras" abre un panel lateral donde se marcan varias a la vez (AsociarComprasPanel).
  const [asociando, setAsociando] = useState(false);
  const [aviso, setAviso] = useState("");
  const disponible = act.presupuesto != null ? act.presupuesto - act.gastado : null;
  async function quitar(c) {
    setError("");
    try { await desasociarCompraApi(act.id, c.id); onCambio(); } catch (e) { setError(e.message || "No se pudo quitar la compra."); }
  }
  const filtradas = useMemo(() => {
    const q = normalizar(buscar);
    return act.detalleCompras.filter((c) => !q || [c.localSeq, c.descripcion, c.proveedor, c.estadoLegalizacion, c.fechaSolicitud].some((v) => normalizar(v).includes(q)));
  }, [act.detalleCompras, buscar]);
  const pag = usePagina(filtradas, buscar);
  return (
    <div className="ficha-seccion cx">
      {/* De un vistazo: cuántas compras, cuánto suman y cuánto queda; a la derecha, la acción principal. */}
      <div className="cx-barra">
        <div className="cx-cifras">
          <div><span>Compras asociadas</span><strong>{act.compras}</strong></div>
          <div><span>Suman</span><strong>{fmtCOP(act.gastado)}</strong></div>
          {disponible != null && <div className={disponible < 0 ? "negativo" : ""}><span>{disponible < 0 ? "Se pasó del presupuesto en" : "Queda del presupuesto"}</span><strong>{fmtCOP(Math.abs(disponible))}</strong></div>}
        </div>
        {editable && (
          <button type="button" className="btn btn-primary" onClick={() => { setAviso(""); setAsociando(true); }}>
            <IconPlus size={13} /> Asociar compras
          </button>
        )}
      </div>
      {error && <div className="modal-error" role="alert">{error}</div>}

      {editable && asociando && (
        <AsociarComprasPanel
          act={act}
          onClose={() => setAsociando(false)}
          onAsociadas={(n, quedaAbierto) => { setAviso(`${n} compra${n > 1 ? "s asociadas" : " asociada"} a la actividad.`); if (!quedaAbierto) setAsociando(false); onCambio(); }}
        />
      )}
      {aviso && <div className="ficha-aviso" role="status">{aviso}</div>}

      <section className="cx-bloque" aria-labelledby="cx-asociadas">
        <div className="cx-bloque-cab">
          <h3 id="cx-asociadas">Compras de esta actividad</h3>
          {act.detalleCompras.length > 0 && <input id="fc-buscar" className="cx-buscar" type="search" aria-label="Buscar entre las compras de esta actividad" placeholder="Buscar por número, descripción o proveedor" value={buscar} onChange={(e) => setBuscar(e.target.value)} />}
        </div>
      <div className="table-card">
        <div className="table-scroll">
          <table className="records ficha-tabla">
            <thead><tr><th>#</th><th>Solicitud</th><th>Descripción</th><th>Proveedor</th><th className="num">Valor con IVA</th><th>Legalización</th><th>Radicada</th>{editable && <th className="actions-col">Acciones</th>}</tr></thead>
            <tbody>
              {pag.pagina.length === 0 && <tr><td colSpan={editable ? 8 : 7}><div className="empty">{act.detalleCompras.length ? "Ninguna compra coincide con la búsqueda." : editable ? "Esta actividad aún no tiene compras. Pulsa «Asociar compras» para elegir las que ya existen, o pídele una a Compras más abajo." : "Esta actividad aún no tiene compras."}</div></td></tr>}
              {pag.pagina.map((c) => (
                <tr key={c.id}>
                  <td className="mono">#{c.localSeq ?? "—"}</td>
                  <td>{c.fechaSolicitud || "—"}</td>
                  <td><span className="desc-tooltip-wrap"><span className="desc-text">{c.descripcion || "—"}</span><span className="desc-tooltip-bubble">{c.descripcion}</span></span></td>
                  <td className="truncate">{c.proveedor || "—"}</td>
                  <td className="num">{fmtCOP(c.valorConIva || 0)}</td>
                  <td>{c.estadoLegalizacion || "—"}</td>
                  <td>{c.radicado ? "Sí" : "No"}</td>
                  {editable && <td className="actions-cell"><button type="button" className="btn small" onClick={() => quitar(c)} title="Quitar esta compra de la actividad (la compra no se borra)">Quitar</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <PiePagina id="fc-size" p={pag} total={filtradas.length} etiqueta="compra(s)" excel={{ nombre: `compras-actividad-${act.id}`, hoja: "Compras", filas: filtradas, columnas: [
          { t: "#", v: (c) => c.localSeq }, { t: "Solicitud", v: (c) => c.fechaSolicitud }, { t: "Descripción", v: (c) => c.descripcion }, { t: "Proveedor", v: (c) => c.proveedor },
          { t: "Valor con IVA ($)", v: (c) => c.valorConIva || 0 }, { t: "Legalización", v: (c) => c.estadoLegalizacion }, { t: "Radicada", v: (c) => (c.radicado ? "Sí" : "No") },
        ] }} />
      </div>
      </section>

      {/* Lo que aún no existe como compra se le pide a Compras. */}
      <SolicitudesActividad actividadId={act.id} puedeSolicitar={editable} />
      {cerrada && <span className="count-note">La actividad está cerrada: no recibe compras nuevas.</span>}
    </div>
  );
}

// ---------- Formulario público ----------
function TabFormulario({ act, puedeEditar, onCambio }) {
  const { confirmar } = useConfirmar();
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
            {puedeEditar && <button type="button" className="btn" onClick={async () => { if (await confirmar({ titulo: "Nuevo enlace", mensaje: "El enlace actual dejará de funcionar. ¿Generar uno nuevo?", boton: "Generar enlace nuevo" })) guardar({ nuevoEnlace: true }); }}>Nuevo enlace</button>}
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
