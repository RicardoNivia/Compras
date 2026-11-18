"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { normalizar } from "@/lib/buscar";
import { crossfade } from "@/lib/crossfade";
import { conFaltantes, conHallazgos, conRevisarHallazgos, conResolverHallazgo, conGenerarReclamacion, conActualizarReclamacion } from "@/lib/consumoApi";
import { useConfirmar } from "@/components/Confirmar";
import BotonExcel from "@/components/BotonExcel";
import { Paginacion } from "@/components/notificaciones/ui";
import { IconSpark, IconCheck, IconCalendar, IconAlert, IconFile, IconClock, IconInfo, IconHistory, IconSearch, IconMoney, IconArrowRight, IconCopy, IconDownload } from "@/components/icons";
import { CabezaAgente, CifraAgente, VacioAgente } from "@/components/bienestar/agentes/comun";
import { SERVICIOS, ORDEN_SERVICIOS, EtiquetaServicio, Modal, fechaCorta, fechaHora } from "@/components/consumo/comun";
import { DetalleReciboModal } from "@/components/consumo/ReciboModales";

// Agentes de Consumo, con el mismo diseño de los de Compras, Bienestar y Tesorería (ag-hero, ag-selector, CabezaAgente,
// tarjetas ag-propuesta coloreadas por confianza). Lo calcula backend/lib/consumo/agentes.js (sin IA) salvo la carta de
// reclamación, que redacta Nova (reclamaciones.js). Nada se envía a la empresa desde aquí.

const PAGE_SIZES = [25, 50, 100];
const AGENTES = [
  { k: "faltantes", color: "azul", icono: <IconCalendar size={22} />, titulo: "Recibos faltantes", nota: "Encuentra los recibos que ya debieron llegar y no se han cargado", cuando: "Úsalo cada semana o antes de cerrar el mes" },
  { k: "hallazgos", color: "ambar", icono: <IconAlert size={22} />, titulo: "Hallazgos en todas las sedes", nota: "Revisa todos los recibos: vencidos, doble cobro, lecturas estimadas, consumos y costos fuera de lo normal", cuando: "Corre solo al cargar o pagar un recibo" },
  { k: "reclamaciones", color: "morado", icono: <IconFile size={22} />, titulo: "Reclamaciones", nota: "Nova redacta la carta a la empresa con las cifras del hallazgo; tú la revisas y la radicas", cuando: "Úsalo con los hallazgos que se pueden reclamar" },
];
const Texto = ({ v, ancho = 320 }) => (v ? <span className="desc-tooltip-wrap" style={{ maxWidth: ancho }}><span className="desc-text">{v}</span><span className="desc-tooltip-bubble">{v}</span></span> : <span className="muted">—</span>);

export default function AgentesConsumo({ acceso }) {
  const params = useSearchParams();
  const inicial = AGENTES.some((a) => a.k === params.get("agente")) ? params.get("agente") : "faltantes";
  const [tab, setTab] = useState(inicial);
  return (
    <div className="agentes">
      <section className="ag-hero">
        <div className="ag-hero-txt">
          <span className="ag-hero-chip"><IconSpark size={13} /> Agentes de Nova</span>
          <h1>¿En qué te ayudo hoy?</h1>
          <p>Elige un agente. Nova revisa los recibos de todas las sedes y tú decides: <b>nada se envía ni se cierra sin que lo confirmes.</b></p>
        </div>
        <div className="ag-hero-orbe" aria-hidden="true"><span /><span /><span /><IconSpark size={24} /></div>
      </section>
      <div className="ag-selector" role="tablist" aria-label="Agentes">
        {AGENTES.map((a) => (
          <button key={a.k} type="button" role="tab" aria-selected={tab === a.k} className={`ag-opcion ag-${a.color}`} onClick={() => crossfade(() => setTab(a.k))}>
            <span className="ag-icono" aria-hidden="true">{a.icono}</span>
            <span className="ag-opcion-txt"><strong>{a.titulo}</strong><span>{a.nota}</span><em>{a.cuando}</em></span>
            <span className="ag-opcion-check" aria-hidden="true"><IconCheck size={13} /></span>
          </button>
        ))}
      </div>
      <div data-crossfade>
        {tab === "faltantes" && <AgenteFaltantes acceso={acceso} />}
        {tab === "hallazgos" && <AgenteHallazgos key="h" acceso={acceso} modo="hallazgos" abrirId={params.get("id")} />}
        {tab === "reclamaciones" && <AgenteHallazgos key="r" acceso={acceso} modo="reclamaciones" />}
      </div>
    </div>
  );
}

// ---------- 1. Recibos faltantes ----------

const TIPOS_FALTANTE = [["", "Todos"], ["atrasado", "Atrasados"], ["hueco", "Huecos"], ["sin_recibos", "Cuentas sin recibos"], ["reemplazada", "Cuentas reemplazadas"]];
const CONF_FALTANTE = { critico: "alta", atencion: "media", info: "baja" };

function AgenteFaltantes({ acceso }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState("");
  const [tipo, setTipo] = useState("");
  const [servicio, setServicio] = useState("");
  const [buscar, setBuscar] = useState("");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(PAGE_SIZES[0]);
  const [revisado, setRevisado] = useState(null);
  const cargar = useCallback(() => conFaltantes({ servicio }).then((r) => { setD(r); setError(""); setRevisado(new Date()); }).catch((e) => setError(e.message)), [servicio]);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { setPage(1); }, [tipo, servicio, buscar, size]);

  const q = normalizar(buscar);
  const items = (d?.items || []).filter((x) => (!tipo || x.tipo === tipo) && (!q || normalizar(`${x.sede} ${x.numeroCuenta || ""} ${x.empresa || ""} ${x.servicioNombre}`).includes(q)));
  const paginas = Math.max(1, Math.ceil(items.length / size));
  const pag = Math.min(page, paginas);
  const visibles = items.slice((pag - 1) * size, pag * size);
  const pt = d?.porTipo || {};
  const puede = !!acceso?.puedeRegistrar;

  return (
    <div className="agente-panel">
      <CabezaAgente icono={<IconCalendar size={22} />} color="azul" titulo="Recibos que no han llegado"
        descripcion={`Revisa cada cuenta activa: si ya cerró el período y pasaron ${d?.graciaDias ?? 20} días sin cargar el recibo, o si quedó un hueco entre dos recibos, te lo dice. El largo del período sale de los recibos de cada cuenta.`}
        pasos={["Nova revisa todas las cuentas activas", "Tú buscas el recibo en el correo o el portal", "Al subirlo, sale de la lista"]} paso={d ? (items.length ? 1 : 3) : 0}>
        <button type="button" className="btn btn-primary ag-btn-grande" onClick={() => { setD(null); cargar(); }}><IconSearch size={16} /> Revisar ahora</button>
      </CabezaAgente>

      <section className="ag-cifras" aria-label="Resumen">
        <CifraAgente icono={<IconClock size={18} />} etiqueta="Atrasados" valor={pt.atrasado ?? "…"} nota="El período cerró y no llegó" tono={pt.atrasado ? "destaca" : "bien"} />
        <CifraAgente icono={<IconInfo size={18} />} etiqueta="Huecos" valor={pt.hueco ?? "…"} nota="Faltan entre dos recibos" />
        <CifraAgente icono={<IconFile size={18} />} etiqueta="Cuentas sin recibos" valor={pt.sin_recibos ?? "…"} nota="Nunca se les cargó uno" />
        <CifraAgente icono={<IconHistory size={18} />} etiqueta="Última revisión" valor={revisado ? revisado.toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" }) : "…"} nota={d ? `${d.cuentasRevisadas} cuenta(s) activas revisadas` : ""} pequena />
      </section>

      {error && <div className="modal-error">{error}</div>}

      <div className="ag-lista-card">
        <div className="ag-barra-filtros">
          <div className="ag-segmentos" role="tablist" aria-label="Qué falta">
            {TIPOS_FALTANTE.map(([k, l]) => <button key={k || "t"} type="button" role="tab" aria-selected={tipo === k} onClick={() => crossfade(() => setTipo(k))}>{l} <span className="ag-num">{k ? pt[k] || 0 : (d?.items || []).length}</span></button>)}
          </div>
          <div className="ag-busqueda">
            <select aria-label="Servicio" value={servicio} onChange={(e) => setServicio(e.target.value)}><option value="">Todos los servicios</option>{ORDEN_SERVICIOS.map((s) => <option key={s} value={s}>{SERVICIOS[s].nombre}</option>)}</select>
            <label className="ag-buscar"><IconSearch size={15} /><input type="search" placeholder="Buscar sede, cuenta o empresa…" value={buscar} onChange={(e) => setBuscar(e.target.value)} aria-label="Buscar" /></label>
            <BotonExcel nombre="consumo-recibos-faltantes" hoja="Faltantes" deshabilitado={!items.length} filas={items} columnas={[
              { t: "Tipo", v: (x) => TIPOS_FALTANTE.find((t) => t[0] === x.tipo)?.[1] }, { t: "Sede", v: (x) => x.sede }, { t: "Servicio", v: (x) => x.servicioNombre },
              { t: "Cuenta", v: (x) => x.numeroCuenta }, { t: "Empresa", v: (x) => x.empresa }, { t: "Qué falta", v: (x) => x.titulo },
              { t: "Desde", v: (x) => x.desde }, { t: "Hasta", v: (x) => x.hasta }, { t: "Días de atraso", v: (x) => x.diasAtraso }, { t: "Detalle", v: (x) => x.detalle },
            ]} />
          </div>
        </div>
        <ul className="ag-propuestas" data-crossfade>
          {!d && !error && [0, 1, 2].map((i) => <li key={i} className="ag-propuesta"><div className="skeleton-bar" style={{ height: 62, borderRadius: 10, width: "100%" }} /></li>)}
          {d && !items.length && <li><VacioAgente icono={<IconCheck size={26} />} titulo={(d.items || []).length ? "Nada coincide con el filtro" : "Están todos los recibos"}>{(d.items || []).length ? "Cambia el tipo, el servicio o la búsqueda." : "Ninguna cuenta activa tiene recibos atrasados ni huecos."}</VacioAgente></li>}
          {visibles.map((x) => (
            <li key={x.id} className={`ag-propuesta conf-${CONF_FALTANTE[x.nivel]}`}>
              <div className="ag-prop-compra">
                <span className="ag-etiqueta">{x.sede}</span>
                <EtiquetaServicio servicio={x.servicio} />
                <span className="ag-prop-meta"><Texto v={`Cuenta ${x.numeroCuenta || "sin número"}${x.empresa ? ` · ${x.empresa}` : ""}`} ancho={260} /></span>
              </div>
              <span className="ag-flecha" aria-hidden="true"><IconArrowRight size={18} /></span>
              <div className="ag-prop-actividad">
                <span className="ag-etiqueta">{TIPOS_FALTANTE.find((t) => t[0] === x.tipo)?.[1]}</span>
                <span className="ag-prop-nombre"><Texto v={x.titulo.replace(`${x.sede} · ${x.servicioNombre}: `, "")} ancho={300} /></span>
                <span className="ag-prop-meta">
                  {x.desde && <span>{fechaCorta(x.desde)} – {fechaCorta(x.hasta)}</span>}
                  {x.diasAtraso != null && <span className={`agente-conf ${CONF_FALTANTE[x.nivel]}`}>{x.diasAtraso} día(s) de atraso</span>}
                </span>
              </div>
              <div className="ag-prop-razon"><span className="ag-etiqueta"><IconSpark size={12} /> Qué hacer</span><Texto v={x.detalle} ancho={320} /></div>
              <div className="ag-prop-acciones">
                {puede && <Link className="btn btn-primary" href="/consumo/subir"><IconSpark size={14} /> Subir con Nova</Link>}
                <Link className="btn ag-btn-suave" href={`/consumo/recibos?q=${encodeURIComponent(x.numeroCuenta || x.sede)}`}>Ver recibos</Link>
              </div>
            </li>
          ))}
        </ul>
        {d && items.length > 0 && <Paginacion id="con-ag-faltantes-size" page={pag} size={size} total={items.length} sizes={PAGE_SIZES} onPage={setPage} onSize={setSize} etiqueta="faltante(s)" />}
      </div>
    </div>
  );
}

// ---------- 4. Hallazgos y 5. Reclamaciones (la misma lista con otro enfoque) ----------

const SEG_CONF = [["", "Todos"], ["alta", "Confianza alta"], ["media", "Confianza media"], ["baja", "Confianza baja"]];
const ESTADOS = [["abierto", "Abiertos"], ["resuelto", "Resueltos"], ["descartado", "Descartados"]];
const SEG_RECL = [["sin", "Por redactar"], ["borrador", "Borradores"], ["radicada", "Radicadas"]];
const PILL_NIVEL = { urgente: "critical", alta: "critical", media: "warning", baja: "muted" };
const TEXTOS = {
  hallazgos: {
    color: "ambar", icono: <IconAlert size={22} />, titulo: "Hallazgos en los recibos de todas las sedes",
    descripcion: "La misma auditoría del contador, pero en todas las sedes y servicios a la vez, más el consumo por día y el costo por unidad de cada recibo frente a sus anteriores. Cada hallazgo se guarda una vez; si deja de cumplirse (por ejemplo, se pagó el recibo) se cierra solo.",
    pasos: ["Nova revisa cada recibo con las reglas del contador", "Tú revisas el hallazgo y su cifra", "Lo resuelves, lo descartas o pides la reclamación"],
  },
  reclamaciones: {
    color: "morado", icono: <IconFile size={22} />, titulo: "Cartas de reclamación a la empresa",
    descripcion: "Para cada hallazgo que se puede reclamar, Nova redacta la carta con los datos de la cuenta, el recibo y las cifras, y cita solo los artículos de la Ley 142 de 1994 que aplican. Lo que no sabe lo deja entre corchetes. Tú la revisas, la envías por el canal de la empresa y la marcas como radicada.",
    pasos: ["Pides el borrador a Nova", "Lo revisas, completas lo que falta y lo copias", "Lo radicas y anotas el número que te dan"],
  },
};

function AgenteHallazgos({ acceso, modo, abrirId }) {
  const tx = TEXTOS[modo];
  const esRecl = modo === "reclamaciones";
  const { confirmar } = useConfirmar();
  const [estado, setEstado] = useState("abierto");
  const [recl, setRecl] = useState("sin");
  const [conf, setConf] = useState("");
  const [servicio, setServicio] = useState("");
  const [buscar, setBuscar] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(PAGE_SIZES[0]);
  const [d, setD] = useState(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [revisando, setRevisando] = useState(false);
  const [ocupado, setOcupado] = useState(null);
  const [nota, setNota] = useState(null); // { h, accion }
  const [carta, setCarta] = useState(abrirId ? Number(abrirId) : null);
  const [recibo, setRecibo] = useState(null);
  const puede = !!acceso?.puedeRegistrar;

  useEffect(() => { const t = setTimeout(() => setQ(buscar.trim()), 300); return () => clearTimeout(t); }, [buscar]);
  const filtros = esRecl ? { estado: "abierto", reclamables: 1, reclamacion: recl, confianza: conf, servicio, q } : { estado, confianza: conf, servicio, q };
  const clave = JSON.stringify(filtros);
  const cargar = useCallback(() => conHallazgos({ ...JSON.parse(clave), page, size }).then((r) => { setD(r); if (r.page !== page) setPage(r.page); setError(""); }).catch((e) => setError(e.message)), [clave, page, size]);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { setPage(1); }, [clave, size]);

  const items = d?.items || [];
  const pc = d?.porConfianza || {};
  const total = (pc.alta || 0) + (pc.media || 0) + (pc.baja || 0);

  async function revisar() {
    setRevisando(true); setError(""); setAviso("");
    try {
      const r = await conRevisarHallazgos({});
      setAviso(`Nova revisó ${r.revisadas} sede(s) y servicio(s): ${r.encontrados} hallazgo(s) vigentes · ${r.nuevos} nuevo(s)${r.reabiertos ? ` · ${r.reabiertos} reabierto(s)` : ""}${r.cerrados ? ` · ${r.cerrados} cerrado(s) porque ya no aplican` : ""}.`);
      await cargar();
    } catch (e) { setError(e.message); } finally { setRevisando(false); }
  }
  async function reabrir(h) {
    if (!(await confirmar({ titulo: "Reabrir hallazgo", mensaje: "¿Volver a dejar abierto este hallazgo?", detalle: h.titulo, boton: "Sí, reabrir" }))) return;
    setOcupado(h.id);
    try { await conResolverHallazgo(h.id, "reabrir", null); setAviso("Hallazgo reabierto."); await cargar(); } catch (e) { setError(e.message); } finally { setOcupado(null); }
  }

  return (
    <div className="agente-panel">
      <CabezaAgente icono={tx.icono} color={tx.color} titulo={tx.titulo} descripcion={tx.descripcion} pasos={tx.pasos} paso={revisando ? 0 : total ? 1 : 3}>
        {puede && !esRecl && <button type="button" className="btn btn-primary ag-btn-grande" onClick={revisar} disabled={revisando}>{revisando ? <><span className="spinner" /> Nova está revisando…</> : <><IconSearch size={16} /> Revisar ahora</>}</button>}
      </CabezaAgente>

      {revisando && (
        <div className="ag-trabajando" role="status">
          <span className="ag-trabajando-orbe" aria-hidden="true"><IconSpark size={18} /></span>
          <div><strong>Nova está revisando los recibos de todas las sedes…</strong><small>La lista se actualiza sola al terminar.</small></div>
        </div>
      )}

      <section className="ag-cifras" aria-label="Resumen">
        <CifraAgente icono={<IconAlert size={18} />} etiqueta={esRecl ? "Por revisar" : "Urgentes · altos"} valor={esRecl ? total : `${d?.porNivel?.urgente ?? 0} · ${d?.porNivel?.alta ?? 0}`} nota={esRecl ? "en esta pestaña" : "Vencidos, doble cobro, titular…"} tono="destaca" />
        <CifraAgente icono={<IconCheck size={18} />} etiqueta="Confianza alta" valor={pc.alta || 0} nota="El dato está en el recibo" tono="bien" />
        <CifraAgente icono={<IconMoney size={18} />} etiqueta="Plata en juego" valor={d?.enJuegoTexto || "…"} nota="Suma de lo que muestra el filtro" pequena />
        <CifraAgente icono={<IconHistory size={18} />} etiqueta="Última revisión completa" valor={d?.ultimaRevision ? new Date(d.ultimaRevision).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" }) : "Hace poco"} nota="También corre al cargar o pagar un recibo" pequena />
      </section>

      {aviso && <div className="ag-aviso ok" role="status"><IconCheck size={16} /> <span>{aviso}</span></div>}
      {error && <div className="modal-error">{error}</div>}

      <div className="ag-lista-card">
        <div className="ag-barra-filtros">
          <div className="ag-segmentos" role="tablist" aria-label={esRecl ? "Reclamación" : "Estado"}>
            {(esRecl ? SEG_RECL : ESTADOS).map(([k, l]) => {
              const on = esRecl ? recl === k : estado === k;
              return <button key={k} type="button" role="tab" aria-selected={on} onClick={() => crossfade(() => (esRecl ? setRecl(k) : setEstado(k)))}>{l}{!esRecl && <span className="ag-num">{d?.porEstado?.[k] || 0}</span>}</button>;
            })}
          </div>
          <div className="ag-segmentos" role="tablist" aria-label="Confianza">
            {SEG_CONF.map(([k, l]) => <button key={k || "t"} type="button" role="tab" aria-selected={conf === k} onClick={() => crossfade(() => setConf(k))}>{l} <span className="ag-num">{k ? pc[k] || 0 : total}</span></button>)}
          </div>
          <div className="ag-busqueda">
            <select aria-label="Servicio" value={servicio} onChange={(e) => setServicio(e.target.value)}><option value="">Todos los servicios</option>{ORDEN_SERVICIOS.filter((s) => s !== "aseo").map((s) => <option key={s} value={s}>{SERVICIOS[s].nombre}</option>)}</select>
            <label className="ag-buscar"><IconSearch size={15} /><input type="search" placeholder="Buscar sede, cuenta o hallazgo…" value={buscar} onChange={(e) => setBuscar(e.target.value)} aria-label="Buscar" /></label>
            <BotonExcel nombre={`consumo-${modo}`} hoja="Hallazgos" deshabilitado={!d?.total} obtener={async () => (await conHallazgos({ ...filtros, page: 1, size: 200 })).items} columnas={[
              { t: "Prioridad", v: (h) => h.nivelTexto }, { t: "Confianza", v: (h) => h.confianza }, { t: "Tipo", v: (h) => h.tipoTexto }, { t: "Sede", v: (h) => h.sede },
              { t: "Servicio", v: (h) => h.servicioNombre }, { t: "Hallazgo", v: (h) => h.titulo }, { t: "Qué hacer", v: (h) => h.accion }, { t: "En juego (COP)", v: (h) => h.valor },
              { t: "Plazo", v: (h) => h.detalle }, { t: "Estado", v: (h) => h.estado }, { t: "Nota", v: (h) => h.nota }, { t: "Reclamación", v: (h) => h.reclamacionEstado }, { t: "Radicado", v: (h) => h.radicadoNumero },
            ]} />
          </div>
        </div>
        <ul className="ag-propuestas" data-crossfade>
          {!d && !error && [0, 1, 2].map((i) => <li key={i} className="ag-propuesta"><div className="skeleton-bar" style={{ height: 62, borderRadius: 10, width: "100%" }} /></li>)}
          {d && !items.length && (
            <li><VacioAgente icono={esRecl ? <IconFile size={26} /> : <IconCheck size={26} />} titulo={esRecl ? (recl === "sin" ? "No hay hallazgos por reclamar" : recl === "borrador" ? "No hay borradores" : "No hay reclamaciones radicadas") : estado === "abierto" ? "Sin hallazgos abiertos" : "Nada en esta pestaña"}>
              {esRecl ? "Los hallazgos que se pueden reclamar aparecen aquí cuando el agente los encuentra." : estado === "abierto" ? "Los recibos no muestran nada que revisar. Usa «Revisar ahora» después de cargar recibos." : "Cambia el filtro o la búsqueda."}
            </VacioAgente></li>
          )}
          {items.map((h) => (
            <li key={h.id} className={`ag-propuesta conf-${h.confianza}`}>
              <div className="ag-prop-compra">
                <span className="ag-etiqueta">{h.sede}</span>
                <EtiquetaServicio servicio={h.servicio} />
                <span className="ag-prop-meta">
                  <span className={`pill ${PILL_NIVEL[h.nivel]}`}>{h.nivelTexto}</span>
                  <span>{h.tipoTexto}</span>
                  {h.recibo && <button type="button" className="btn small" onClick={() => setRecibo(h.recibo.id)}>Recibo {h.recibo.mes}</button>}
                </span>
              </div>
              <span className="ag-flecha" aria-hidden="true"><IconArrowRight size={18} /></span>
              <div className="ag-prop-actividad">
                <span className="ag-etiqueta">Qué encontró</span>
                <span className="ag-prop-nombre"><Texto v={h.titulo} ancho={320} /></span>
                <span className="ag-prop-meta">
                  {h.valorTexto && <b>{h.valorTexto} en juego</b>}
                  <span className={`agente-conf ${h.confianza}`}>Confianza {h.confianza}</span>
                  {h.reclamacionEstado && <span className={`pill ${h.reclamacionEstado === "radicada" ? "good" : "accent"}`}>{h.reclamacionEstado === "radicada" ? `Radicada${h.radicadoNumero ? ` · ${h.radicadoNumero}` : ""}` : "Borrador de reclamación"}</span>}
                </span>
              </div>
              <div className="ag-prop-razon">
                <span className="ag-etiqueta"><IconSpark size={12} /> {h.estado === "abierto" ? "Qué hacer" : h.estado === "resuelto" ? "Resuelto" : "Descartado"}</span>
                <Texto v={h.estado === "abierto" ? `${h.accion}${h.detalle ? ` · ${h.detalle}` : ""}` : `${h.resueltoPorNombre || ""}${h.resueltoAt ? ` · ${fechaHora(h.resueltoAt)}` : ""}${h.nota ? ` · ${h.nota}` : ""}`} ancho={320} />
              </div>
              <div className="ag-prop-acciones">
                {h.reclamable && h.estado === "abierto" && (h.reclamacion || puede) && <button type="button" className={`btn ${esRecl || h.reclamacion ? "btn-primary" : "ag-btn-suave"}`} onClick={() => setCarta(h.id)}><IconFile size={14} /> {h.reclamacion ? "Ver reclamación" : "Reclamar"}</button>}
                {puede && h.estado === "abierto" && !esRecl && <button type="button" className="btn btn-primary" disabled={ocupado === h.id} onClick={() => setNota({ h, accion: "resolver" })}><IconCheck size={14} /> Resuelto</button>}
                {puede && h.estado === "abierto" && !esRecl && <button type="button" className="btn ag-btn-suave" disabled={ocupado === h.id} onClick={() => setNota({ h, accion: "descartar" })}>Descartar</button>}
                {puede && h.estado !== "abierto" && <button type="button" className="btn ag-btn-suave" disabled={ocupado === h.id} onClick={() => reabrir(h)}>Reabrir</button>}
              </div>
            </li>
          ))}
        </ul>
        {d && d.total > 0 && <Paginacion id={`con-ag-${modo}-size`} page={page} size={size} total={d.total} sizes={PAGE_SIZES} onPage={setPage} onSize={setSize} etiqueta="hallazgo(s)" />}
      </div>

      {nota && <NotaModal h={nota.h} accion={nota.accion} onClose={() => setNota(null)} onListo={(msg) => { setNota(null); setAviso(msg); cargar(); }} />}
      {carta && <ReclamacionModal id={carta} lista={d?.items} puede={puede} onClose={() => setCarta(null)} onCambio={(msg) => { if (msg) setAviso(msg); cargar(); }} />}
      {recibo && <DetalleReciboModal id={recibo} acceso={acceso} onClose={() => setRecibo(null)} onCambio={() => cargar()} onEditar={() => setRecibo(null)} />}
    </div>
  );
}

// Resolver (nota opcional) o descartar (nota obligatoria: queda en Auditoría).
function NotaModal({ h, accion, onClose, onListo }) {
  const [texto, setTexto] = useState("");
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const descartar = accion === "descartar";
  async function enviar(e) {
    e.preventDefault();
    if (descartar && !texto.trim()) { setError("Escribe por qué lo descartas."); return; }
    setOcupado(true); setError("");
    try { await conResolverHallazgo(h.id, accion, texto.trim() || null); onListo(descartar ? "Hallazgo descartado: no vuelve a aparecer aunque el agente lo encuentre otra vez." : "Hallazgo marcado como resuelto."); } catch (err) { setError(err.message); setOcupado(false); }
  }
  return (
    <Modal titulo={descartar ? "Descartar hallazgo" : "Marcar como resuelto"} sub={`${h.sede} · ${h.tipoTexto}`} onClose={onClose} ancho={560} onSubmit={enviar}
      pie={<><button type="button" className="btn" onClick={onClose}>Cancelar</button><button type="submit" className={`btn ${descartar ? "btn-danger" : "btn-primary"}`} disabled={ocupado}>{ocupado ? "Guardando…" : descartar ? "Sí, descartar" : "Sí, está resuelto"}</button></>}>
      <p style={{ marginTop: 0 }}>{h.titulo}</p>
      <p className="card-sub">{descartar ? "Un hallazgo descartado no vuelve a abrirse solo: queda en la pestaña Descartados y en la Auditoría con tu nota." : "Si el agente lo vuelve a encontrar en una revisión, no lo reabre: lo cerraste tú."}</p>
      <div className="field">
        <label htmlFor="con-nota">{descartar ? "¿Por qué lo descartas?" : "¿Qué se hizo? (opcional)"}</label>
        <textarea id="con-nota" rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={descartar ? "Ej.: el consumo alto fue por la obra de octubre." : "Ej.: se pagó el 12 de noviembre; la empresa reliquidó."} />
      </div>
      {error && <div className="modal-error">{error}</div>}
    </Modal>
  );
}

// El hallazgo con su carta de reclamación: pedir el borrador a Nova, editarlo, copiarlo y marcarlo como radicado.
function ReclamacionModal({ id, lista, puede, onClose, onCambio }) {
  const { confirmar } = useConfirmar();
  const [h, setH] = useState(() => (lista || []).find((x) => x.id === id) || null);
  const [form, setForm] = useState(null);
  const [radicado, setRadicado] = useState({ numero: "", fecha: "" });
  const [ocupado, setOcupado] = useState("");
  const [error, setError] = useState("");
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (h && h.id === id) return;
    fetch(`/api/consumo/agentes/hallazgos/${id}`, { cache: "no-store" }).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "No se encontró el hallazgo."); setH(j); }).catch((e) => setError(e.message));
  }, [id, h]);
  useEffect(() => { if (h?.reclamacion) setForm({ asunto: h.reclamacion.asunto, destinatario: h.reclamacion.destinatario, cuerpo: h.reclamacion.cuerpo, anexos: (h.reclamacion.anexos || []).join("\n") }); else setForm(null); }, [h]);

  const radicada = h?.reclamacionEstado === "radicada";
  const cambiado = form && h?.reclamacion && (form.asunto !== h.reclamacion.asunto || form.destinatario !== h.reclamacion.destinatario || form.cuerpo !== h.reclamacion.cuerpo || form.anexos !== (h.reclamacion.anexos || []).join("\n"));
  const textoCompleto = form ? `${form.destinatario}\n\nAsunto: ${form.asunto}\n\n${form.cuerpo}${form.anexos.trim() ? `\n\nAnexos:\n${form.anexos.split("\n").filter(Boolean).map((a, i) => `${i + 1}. ${a}`).join("\n")}` : ""}` : "";

  async function accion(nombre, fn, msg) {
    setOcupado(nombre); setError("");
    try { const r = await fn(); setH(r); onCambio(msg); } catch (e) { setError(e.message); } finally { setOcupado(""); }
  }
  async function generar() {
    if (h.reclamacion && !(await confirmar({ titulo: "Volver a redactar", mensaje: "Nova escribirá un borrador nuevo y se perderán los cambios que le hiciste a este.", boton: "Sí, redactar de nuevo", peligro: true }))) return;
    accion("generar", () => conGenerarReclamacion(h.id), "Nova redactó el borrador de la reclamación.");
  }
  async function quitar() {
    if (!(await confirmar({ titulo: "Quitar el borrador", mensaje: "¿Borrar el borrador de esta reclamación?", detalle: h.reclamacion?.asunto, boton: "Sí, quitar", peligro: true }))) return;
    accion("quitar", () => conActualizarReclamacion(h.id, { accion: "quitar" }), "Borrador quitado.");
  }
  async function copiar() {
    try { await navigator.clipboard.writeText(textoCompleto); setCopiado(true); setTimeout(() => setCopiado(false), 2500); } catch { setError("No se pudo copiar: selecciona el texto y cópialo a mano."); }
  }
  function descargar() {
    const url = URL.createObjectURL(new Blob([textoCompleto], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `reclamacion-${(h.sede || "sede").replace(/\s+/g, "-").toLowerCase()}-${h.id}.txt`; a.click(); URL.revokeObjectURL(url);
  }

  return (
    <Modal titulo={h ? `${h.tipoTexto} · ${h.sede}` : "Hallazgo"} sub={h ? `${h.servicioNombre}${h.recibo ? ` · recibo ${h.recibo.mes}${h.recibo.numeroCuenta ? ` · cuenta ${h.recibo.numeroCuenta}` : ""}` : ""}` : ""} onClose={onClose} ancho={820}
      pie={<button type="button" className="btn" onClick={onClose}>Cerrar</button>}>
      {!h && !error && <div className="skeleton-bar" style={{ height: 160, borderRadius: 12 }} />}
      {error && <div className="modal-error">{error}</div>}
      {h && (
        <div className="con-recl">
          <div className={`ag-propuesta conf-${h.confianza} con-recl-hallazgo`}>
            <div className="ag-prop-actividad" style={{ gridColumn: "1 / -1" }}>
              <span className="ag-etiqueta">Qué encontró el agente</span>
              <strong>{h.titulo}</strong>
              <span>{h.accion}</span>
              <span className="ag-prop-meta">
                <span className={`pill ${PILL_NIVEL[h.nivel]}`}>{h.nivelTexto}</span>
                <span className={`agente-conf ${h.confianza}`}>Confianza {h.confianza}</span>
                {h.valorTexto && <b>{h.valorTexto} en juego</b>}
                {h.detalle && <span>{h.detalle}</span>}
              </span>
            </div>
          </div>

          {!h.reclamable && <p className="card-sub">Este hallazgo no se reclama: hay que resolverlo (por ejemplo, pagar el recibo).</p>}

          {h.reclamable && !h.reclamacion && (
            <div className="ag-lote">
              <span className="ag-lote-icono" aria-hidden="true"><IconSpark size={18} /></span>
              <div className="ag-lote-txt"><strong>Nova puede redactar la carta</strong><small>Usa solo los datos de la cuenta, el recibo y el hallazgo, y cita solo los artículos de la Ley 142 de 1994 que aplican. Lo que no sabe (NIT, quién firma, teléfono) lo deja entre corchetes. Tarda unos segundos.</small></div>
              {puede && <button type="button" className="btn btn-primary" disabled={!!ocupado} onClick={generar}>{ocupado === "generar" ? <><span className="spinner" /> Redactando…</> : <><IconSpark size={14} /> Redactar con Nova</>}</button>}
            </div>
          )}

          {h.reclamacion && form && (
            <>
              <div className="con-recl-estado">
                <span className={`pill ${radicada ? "good" : "accent"}`}>{radicada ? `Radicada${h.radicadoNumero ? ` · N.º ${h.radicadoNumero}` : ""}${h.radicadaAt ? ` · ${fechaHora(h.radicadaAt)}` : ""}` : "Borrador"}</span>
                <span className="card-sub" style={{ margin: 0 }}>Redactada por Nova para {h.reclamacionPorNombre || "—"} · {fechaHora(h.reclamacionAt)}</span>
              </div>
              {h.reclamacion.datosFaltantes?.length > 0 && (
                <div className="ag-aviso" role="note"><IconInfo size={16} /> <span><b>Completa antes de enviarla:</b> {h.reclamacion.datosFaltantes.join(" · ")}</span></div>
              )}
              <div className="field"><label htmlFor="recl-dest">Para</label><input id="recl-dest" value={form.destinatario} disabled={radicada || !puede} onChange={(e) => setForm({ ...form, destinatario: e.target.value })} /></div>
              <div className="field"><label htmlFor="recl-asunto">Asunto</label><input id="recl-asunto" value={form.asunto} disabled={radicada || !puede} onChange={(e) => setForm({ ...form, asunto: e.target.value })} /></div>
              <div className="field"><label htmlFor="recl-cuerpo">Carta</label><textarea id="recl-cuerpo" className="con-recl-cuerpo" rows={16} value={form.cuerpo} disabled={radicada || !puede} onChange={(e) => setForm({ ...form, cuerpo: e.target.value })} /></div>
              <div className="field"><label htmlFor="recl-anexos">Anexos (uno por línea)</label><textarea id="recl-anexos" rows={3} value={form.anexos} disabled={radicada || !puede} onChange={(e) => setForm({ ...form, anexos: e.target.value })} /></div>
              <p className="card-sub">La referencia a la Ley 142 de 1994 es informativa; no es asesoría legal. Nada se envía desde la app: cópiala o descárgala y radícala por el canal de la empresa.</p>
              <div className="con-recl-acciones">
                <button type="button" className="btn" onClick={copiar}><IconCopy size={14} /> {copiado ? "¡Copiada!" : "Copiar carta"}</button>
                <button type="button" className="btn" onClick={descargar}><IconDownload size={14} /> Descargar .txt</button>
                {puede && !radicada && <button type="button" className="btn btn-primary" disabled={!cambiado || !!ocupado} onClick={() => accion("guardar", () => conActualizarReclamacion(h.id, { accion: "guardar", ...form, anexos: form.anexos.split("\n") }), "Cambios de la reclamación guardados.")}>{ocupado === "guardar" ? "Guardando…" : "Guardar cambios"}</button>}
                {puede && !radicada && <button type="button" className="btn ag-btn-suave" disabled={!!ocupado} onClick={generar}>{ocupado === "generar" ? "Redactando…" : "Redactar de nuevo"}</button>}
                {puede && !radicada && <button type="button" className="btn ag-btn-suave" disabled={!!ocupado} onClick={quitar}>Quitar borrador</button>}
                {puede && radicada && <button type="button" className="btn ag-btn-suave" disabled={!!ocupado} onClick={() => accion("borrador", () => conActualizarReclamacion(h.id, { accion: "borrador" }), "La reclamación volvió a borrador.")}>Volver a borrador</button>}
              </div>
              {puede && !radicada && (
                <div className="ag-lista-card con-recl-radicar">
                  <strong>¿Ya la radicaste?</strong>
                  <span className="card-sub" style={{ margin: 0 }}>Anota el número que te dio la empresa: la respuesta debe llegar en 15 días hábiles.</span>
                  <div className="con-recl-radicar-campos">
                    <div className="field"><label htmlFor="recl-num">Número de radicado</label><input id="recl-num" value={radicado.numero} onChange={(e) => setRadicado({ ...radicado, numero: e.target.value })} placeholder="Ej.: 2026-123456" /></div>
                    <div className="field"><label htmlFor="recl-fecha">Fecha</label><input id="recl-fecha" type="date" value={radicado.fecha} onChange={(e) => setRadicado({ ...radicado, fecha: e.target.value })} /></div>
                    <button type="button" className="btn btn-primary" disabled={!!ocupado || cambiado} title={cambiado ? "Guarda los cambios primero" : undefined} onClick={() => accion("radicar", () => conActualizarReclamacion(h.id, { accion: "radicar", numero: radicado.numero, fecha: radicado.fecha || null }), "Reclamación marcada como radicada.")}><IconCheck size={14} /> Marcar radicada</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
