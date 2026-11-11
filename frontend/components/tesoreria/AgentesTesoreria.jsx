"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { tesPropuestas, tesBuscarPropuestas, tesResolverPropuesta, tesAceptarAltas, tesResumen } from "@/lib/tesoreriaApi";
import { crossfade } from "@/lib/crossfade";
import { Paginacion } from "@/components/notificaciones/ui";
import { IconSpark, IconCheck, IconLayers, IconCalendar, IconClock, IconInfo, IconHistory, IconSearch, IconMoney } from "@/components/icons";
import { CabezaAgente, CifraAgente, VacioAgente } from "@/components/bienestar/agentes/comun";
import { useCatalogos, MESES, anioActual, mesActual, BotonExcel, todasLasPaginas, useAniosTesoreria } from "@/components/tesoreria/comun";
import PropuestaAsociacion from "@/components/tesoreria/PropuestaAsociacion";
import { ProponerModal } from "@/components/tesoreria/PagoModales";
import { DetalleMovimientoModal } from "@/components/tesoreria/MovimientoModales";

const PAGE_SIZES = [25, 50, 100];
const AGENTES = [
  { k: "asociar", color: "verde", icono: <IconLayers size={22} />, titulo: "Asociar movimientos", nota: "Encuentra qué pago programado corresponde a cada movimiento del banco", cuando: "Úsalo después de subir la plantilla o un extracto" },
  { k: "pagos", color: "turquesa", icono: <IconMoney size={22} />, titulo: "Pagos sin movimiento", nota: "Toma los pagos que ya debían estar pagados y busca en el banco el movimiento que los pagó", cuando: "Úsalo cuando tengas pagos vencidos o en E sin movimiento" },
  { k: "proponer", color: "azul", icono: <IconCalendar size={22} />, titulo: "Proponer pagos", nota: "Arma los pagos de un mes o del año con tus gastos periódicos y lo del año pasado", cuando: "Úsalo cuando un mes está vacío o al empezar el año" },
];
const SEGMENTOS = [["", "Todas"], ["alta", "Confianza alta"], ["media", "Confianza media"], ["baja", "Confianza baja"]];

// Agentes de Tesorería, con el mismo diseño de los de Compras y Bienestar. Ninguno guarda nada sin que la persona confirme.
export default function AgentesTesoreria({ acceso }) {
  const params = useSearchParams();
  const [tab, setTab] = useState(["proponer", "pagos"].includes(params.get("agente")) ? params.get("agente") : "asociar");
  return (
    <div className="agentes">
      <section className="ag-hero">
        <div className="ag-hero-txt">
          <span className="ag-hero-chip"><IconSpark size={13} /> Agentes de Nova</span>
          <h1>¿En qué te ayudo hoy?</h1>
          <p>Elige un agente. Nova hace el trabajo pesado y tú decides: <b>nada se guarda sin que lo confirmes.</b></p>
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
        {tab === "asociar" && <AgenteAsociacion key="movimientos" acceso={acceso} />}
        {tab === "pagos" && <AgenteAsociacion key="pagos" acceso={acceso} agente="pagos" />}
        {tab === "proponer" && <AgenteProponer acceso={acceso} />}
      </div>
    </div>
  );
}

// Textos de cada agente de asociación: «movimientos» (del movimiento a su pago) y «pagos» (del pago a su movimiento).
const TEXTOS = {
  movimientos: {
    color: "verde", icono: <IconLayers size={22} />, titulo: "Asociar movimientos a su pago",
    descripcion: "Nova cruza los movimientos del banco que no tienen pago con los pagos programados (también los que el Excel trajo en E sin movimiento) y te propone la pareja.",
    pasos: ["Nova compara valor, mes, texto, banco y lo que ya asociaste", "Tú revisas cada propuesta y su porqué", "Al asociar, el pago pasa a E (pagado)"],
    trabajando: "Nova está revisando los movimientos sin pago…", vacio: "Usa «Buscar ahora» y Nova revisará los movimientos del banco que aún no tienen pago.",
  },
  pagos: {
    color: "turquesa", icono: <IconMoney size={22} />, titulo: "Encontrar el movimiento de cada pago",
    descripcion: "Nova toma los pagos que ya debían estar pagados (vencidos en P o en E sin movimiento) y busca en el banco el movimiento que los pagó: mismo sentido, valor, fecha cercana, texto, banco = medio de pago y lo que ya asociaste.",
    pasos: ["Eliges qué pagos revisar y de qué período", "Nova busca el movimiento del banco de cada uno", "Tú apruebas: el pago queda asociado y en E"],
    trabajando: "Nova está buscando el movimiento de cada pago…", vacio: "Elige qué pagos revisar y usa «Buscar ahora»: Nova buscará en el banco el movimiento de cada uno.",
  },
};
const ALCANCES = [["todos", "Vencidos y pagados sin movimiento"], ["vencidos", "Solo vencidos (P)"], ["pagadosSinMovimiento", "Solo pagados (E) sin movimiento"]];

function AgenteAsociacion({ acceso, agente = "movimientos" }) {
  const tx = TEXTOS[agente];
  const [alcance, setAlcance] = useState("todos");
  const [anioP, setAnioP] = useState(anioActual());
  const [mesP, setMesP] = useState("");
  const aniosConPagos = useAniosTesoreria(); // años anteriores solo si tienen pagos
  const { cat } = useCatalogos();
  const [conf, setConf] = useState("");
  const [buscar, setBuscar] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(PAGE_SIZES[0]);
  const [d, setD] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [ultima, setUltima] = useState(null);
  const [ocupado, setOcupado] = useState(null);
  const [resueltas, setResueltas] = useState({});
  const [confirmarLote, setConfirmarLote] = useState(false);
  const [aMano, setAMano] = useState(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const puede = !!acceso?.puedeRegistrar;

  useEffect(() => { const t = setTimeout(() => setQ(buscar.trim().toLowerCase()), 300); return () => clearTimeout(t); }, [buscar]);
  const cargar = useCallback(() => tesPropuestas({ agente, confianza: conf, page: q ? 1 : page, size: q ? 100 : size }).then((r) => { setD(r); if (!q && r.page !== page) setPage(r.page); setError(""); }).catch((e) => setError(e.message)), [agente, conf, page, size, q]);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { setPage(1); }, [conf, size, q]);

  async function iniciar() {
    setBuscando(true); setError(""); setAviso("");
    try {
      const r = await tesBuscarPropuestas(agente === "pagos" ? { agente, alcance, anio: anioP || null, mes: mesP || null } : {});
      setUltima({ ...r, at: new Date() }); setResueltas({}); await cargar();
      setAviso(agente === "pagos"
        ? `Nova revisó ${r.pagosRevisados} pago(s): ${r.propuestas} propuesta(s) (${r.porConfianza.alta} alta, ${r.porConfianza.media} media, ${r.porConfianza.baja} baja)${r.enOtroAgente ? ` · ${r.enOtroAgente} ya estaban propuestas en «Asociar movimientos»` : ""}${r.sinCandidato ? ` · ${r.sinCandidato} sin ningún movimiento parecido en el banco` : ""}.`
        : `Nova revisó ${r.movimientosSinAsignar} movimiento(s) sin pago: ${r.propuestas} propuesta(s) (${r.porConfianza.alta} alta, ${r.porConfianza.media} media, ${r.porConfianza.baja} baja).`);
    } catch (e) { setError(e.message); } finally { setBuscando(false); }
  }
  async function resolver(p, accion) {
    setOcupado(p.id); setError(""); setAviso("");
    try { await tesResolverPropuesta(p.id, accion); setResueltas((x) => ({ ...x, [p.id]: accion })); setAviso(accion === "aceptar" ? `Asociado: «${p.pago.concepto}» quedó pagado (E).` : "Propuesta descartada."); } catch (e) { setError(e.message); } finally { setOcupado(null); }
  }
  async function aceptarAltas() {
    setOcupado("lote"); setError(""); setAviso("");
    try { const r = await tesAceptarAltas(agente); setAviso(`${r.aceptadas} ${agente === "pagos" ? "pago(s) asociados a su movimiento" : "movimiento(s) asociados a su pago"}: quedaron en E.${r.errores.length ? ` ${r.errores.length} no se pudieron.` : ""}`); setResueltas({}); await cargar(); } catch (e) { setError(e.message); } finally { setOcupado(null); setConfirmarLote(false); }
  }

  const pc = d?.porConfianza || {};
  const total = (pc.alta || 0) + (pc.media || 0) + (pc.baja || 0);
  const items = (d?.items || []).filter((p) => !q || `${p.movimiento.descripcion} ${p.movimiento.concepto || ""} ${p.movimiento.tercero || ""} ${p.pago.concepto} ${p.pago.item || ""}`.toLowerCase().includes(q));
  const cuenta = (k) => (k ? pc[k] || 0 : total);
  return (
    <div className="agente-panel">
      <CabezaAgente icono={tx.icono} color={tx.color} titulo={tx.titulo} descripcion={tx.descripcion} pasos={tx.pasos} paso={buscando ? 0 : total ? 1 : 3}>
        {puede && <button type="button" className="btn btn-primary ag-btn-grande" onClick={iniciar} disabled={buscando}>{buscando ? <><span className="spinner" /> Nova está revisando…</> : <><IconSearch size={16} /> Buscar ahora</>}</button>}
      </CabezaAgente>

      {buscando && (
        <div className="ag-trabajando" role="status">
          <span className="ag-trabajando-orbe" aria-hidden="true"><IconSpark size={18} /></span>
          <div><strong>{tx.trabajando}</strong><small>La lista se actualiza sola al terminar.</small></div>
        </div>
      )}

      <section className="ag-cifras" aria-label="Resumen">
        <CifraAgente icono={<IconClock size={18} />} etiqueta="Por revisar" valor={total} nota="propuestas pendientes" tono="destaca" />
        <CifraAgente icono={<IconCheck size={18} />} etiqueta="Confianza alta" valor={pc.alta || 0} nota={agente === "pagos" ? "Mismo valor, fecha cercana y otra señal" : "Mismo valor, mismo mes y otra señal"} tono="bien" />
        <CifraAgente icono={<IconInfo size={18} />} etiqueta="Media · Baja" valor={`${pc.media || 0} · ${pc.baja || 0}`} nota="Revísalas con calma" />
        <CifraAgente icono={<IconHistory size={18} />} etiqueta="Última búsqueda" valor={ultima ? ultima.at.toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" }) : "En esta visita, aún no"} nota={ultima ? (agente === "pagos" ? `${ultima.pagosRevisados} pago(s) revisados` : `${ultima.movimientosSinAsignar} movimiento(s) revisados`) : "Usa «Buscar ahora» para actualizar"} pequena />
      </section>

      {agente === "pagos" && (
        <div className="ag-lista-card ag-alcance">
          <div className="ag-barra-filtros">
            <div className="ag-segmentos" role="tablist" aria-label="Qué pagos revisar">
              {ALCANCES.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={alcance === k} onClick={() => setAlcance(k)}>{l}</button>)}
            </div>
            <div className="ag-busqueda">
              <select aria-label="Año" value={anioP} onChange={(e) => setAnioP(e.target.value ? Number(e.target.value) : "")}><option value="">Todos los años</option>{[...new Set([...(aniosConPagos || []), anioActual()])].filter((a) => a <= anioActual() + 1).sort((x, y) => x - y).map((a) => <option key={a} value={a}>{a}</option>)}</select>
              <select aria-label="Mes" value={mesP} onChange={(e) => setMesP(e.target.value ? Number(e.target.value) : "")}><option value="">Todos los meses</option>{MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
            </div>
          </div>
        </div>
      )}

      {aviso && <div className="ag-aviso ok" role="status"><IconCheck size={16} /> <span>{aviso}</span></div>}
      {error && <div className="modal-error">{error}</div>}

      {puede && (pc.alta || 0) > 0 && (
        <div className="ag-lote">
          <span className="ag-lote-icono" aria-hidden="true"><IconSpark size={18} /></span>
          <div className="ag-lote-txt"><strong>{pc.alta} propuesta(s) con confianza alta</strong><small>{agente === "pagos" ? "Mismo valor, fecha cercana al pago y otra señal (texto, banco = medio de pago o ya lo asociaste así)." : "Mismo valor, mismo mes y otra señal (texto, banco = medio de pago o ya lo asociaste así)."} Puedes asociarlas todas de una vez.</small></div>
          {confirmarLote ? (
            <span className="ag-lote-acciones">
              <span>¿Asociar las {pc.alta}?</span>
              <button type="button" className="btn btn-primary" disabled={ocupado === "lote"} onClick={aceptarAltas}>{ocupado === "lote" ? "Asociando…" : "Sí, asociar"}</button>
              <button type="button" className="btn" onClick={() => setConfirmarLote(false)}>No</button>
            </span>
          ) : <button type="button" className="btn btn-primary" onClick={() => setConfirmarLote(true)}>Asociar las {pc.alta}</button>}
        </div>
      )}

      <div className="ag-lista-card">
        <div className="ag-barra-filtros">
          <div className="ag-segmentos" role="tablist" aria-label="Confianza">
            {SEGMENTOS.map(([k, l]) => <button key={k || "t"} type="button" role="tab" aria-selected={conf === k} onClick={() => crossfade(() => setConf(k))}>{l} <span className="ag-num">{cuenta(k)}</span></button>)}
          </div>
          <div className="ag-busqueda">
            <label className="ag-buscar"><IconSearch size={15} /><input type="search" placeholder={agente === "pagos" ? "Buscar pago o movimiento…" : "Buscar movimiento o pago…"} value={buscar} onChange={(e) => setBuscar(e.target.value)} aria-label="Buscar" /></label>
            <BotonExcel nombre={`tesoreria-propuestas-${agente}`} hoja="Propuestas" deshabilitado={!total} obtener={() => todasLasPaginas(tesPropuestas, { agente, confianza: conf })} columnas={[
              { t: "Confianza", v: (p) => p.confianza }, { t: "Banco", v: (p) => p.movimiento.banco }, { t: "Fecha movimiento", v: (p) => p.movimiento.fecha },
              { t: "Descripción", v: (p) => p.movimiento.descripcion }, { t: "Concepto del movimiento", v: (p) => p.movimiento.concepto }, { t: "Valor movimiento", v: (p) => p.movimiento.valorTexto },
              { t: "Pago propuesto", v: (p) => p.pago.concepto }, { t: "Ítem", v: (p) => p.pago.item }, { t: "Mes del pago", v: (p) => `${p.pago.anio}-${String(p.pago.mes).padStart(2, "0")}` },
              { t: "Valor del pago", v: (p) => p.pago.valorTexto }, { t: "Se asociaría", v: (p) => p.valorTexto }, { t: "Por qué", v: (p) => p.motivo },
            ]} />
          </div>
        </div>
        <ul className="ag-propuestas" data-crossfade>
          {!d && [0, 1, 2].map((i) => <li key={i} className="ag-propuesta"><div className="skeleton-bar" style={{ height: 62, borderRadius: 10, width: "100%" }} /></li>)}
          {d && !items.length && (
            <li><VacioAgente icono={agente === "pagos" ? <IconMoney size={26} /> : <IconLayers size={26} />} titulo={total ? "Ninguna propuesta coincide" : "No hay propuestas por revisar"}>{total ? "Cambia la confianza o la búsqueda." : tx.vacio}</VacioAgente></li>
          )}
          {items.map((p) => (
            <PropuestaAsociacion key={p.id} movimiento={p.movimiento} pago={p.pago} confianza={p.confianza} motivo={p.motivo} valorTexto={p.valorTexto}
              resuelta={resueltas[p.id]} puede={puede} ocupado={ocupado === p.id}
              onAceptar={() => resolver(p, "aceptar")} onDescartar={() => resolver(p, "descartar")} onAMano={() => setAMano(p.movimiento.id)} />
          ))}
        </ul>
        {d && !q && <Paginacion id={`tes-ag-pagesize-${agente}`} page={page} size={size} total={d.total} sizes={PAGE_SIZES} onPage={setPage} onSize={setSize} etiqueta="propuesta(s)" />}
      </div>
      {aMano && cat && <DetalleMovimientoModal id={aMano} cat={cat} puedeRegistrar={puede} onClose={() => { setAMano(null); cargar(); }} onCambio={(msg) => { if (msg) setAviso(msg); }} onEditar={() => { window.location.href = `/tesoreria/movimientos?id=${aMano}`; }} />}
    </div>
  );
}

function AgenteProponer({ acceso }) {
  const [anio, setAnio] = useState(anioActual());
  const [conteos, setConteos] = useState(null);
  const [abrir, setAbrir] = useState(null);
  const [aviso, setAviso] = useState("");
  const puede = !!acceso?.puedeRegistrar;
  const cargar = useCallback(() => tesResumen(anio, 12).then((r) => setConteos(r.porMes.map((m) => m.pagos))).catch(() => setConteos(null)), [anio]);
  useEffect(() => { cargar(); }, [cargar]);
  const vacios = conteos ? conteos.map((n, i) => (n ? null : i + 1)).filter(Boolean) : [];
  return (
    <div className="agente-panel">
      <CabezaAgente
        icono={<IconCalendar size={22} />}
        color="azul"
        titulo="Proponer los pagos de un mes o del año"
        descripcion="Toma tus gastos periódicos activos (sus periodos que faltan, con el último valor pagado) y lo que pagaste ese mes el año anterior; Nova dice qué de eso parece repetirse."
        pasos={["Eliges el mes o el año", "Nova arma la lista y explica cada pago", "Tú marcas cuáles crear y ajustas el valor"]}
        paso={0}
      >
        {puede && <button type="button" className="btn btn-primary ag-btn-grande" onClick={() => setAbrir({ mes: mesActual() })}><IconSpark size={16} /> Proponer pagos</button>}
      </CabezaAgente>
      {aviso && <div className="ag-aviso ok" role="status"><IconCheck size={16} /> <span>{aviso}</span></div>}
      <div className="ag-lista-card" style={{ padding: 16, gap: 12 }}>
        <div className="ag-barra-filtros" style={{ padding: 0 }}>
          <div className="ag-segmentos" role="tablist" aria-label="Año">{[anioActual(), anioActual() + 1].map((a) => <button key={a} type="button" role="tab" aria-selected={anio === a} onClick={() => setAnio(a)}>{a}</button>)}</div>
          <span className="card-sub" style={{ margin: 0 }}>{conteos ? (vacios.length ? `${vacios.length} mes(es) de ${anio} sin pagos programados. Toca uno para que Nova te los proponga.` : `Todos los meses de ${anio} ya tienen pagos.`) : "Cargando…"}</span>
        </div>
        <div className="tes-meses">
          {MESES.map((m, i) => (
            <button key={m} type="button" className={`tes-mes${conteos && !conteos[i] ? " hoy" : ""}`} disabled={!puede} onClick={() => setAbrir({ mes: i + 1 })} title={conteos && !conteos[i] ? "Sin pagos: pídele a Nova que los proponga" : "Proponer lo que falte en este mes"}>
              <b>{m.slice(0, 3)}</b><span>{conteos ? `${conteos[i]} pagos` : "…"}</span>
            </button>
          ))}
        </div>
        {puede && <div className="tes-cabecera"><button type="button" className="btn" onClick={() => setAbrir({ mes: null })}>Proponer todo {anio}</button></div>}
      </div>
      {abrir && <ProponerModal anio={anio} mes={abrir.mes} onClose={() => setAbrir(null)} onListo={(msg) => { setAbrir(null); setAviso(msg); cargar(); }} />}
    </div>
  );
}
