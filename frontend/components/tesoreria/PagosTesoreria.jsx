"use client";

import EstadoVacio from "@/components/EstadoVacio";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { tesPagos, tesResumen } from "@/lib/tesoreriaApi";
import { fmtMoneda } from "@/lib/moneda";
import { crossfade } from "@/lib/crossfade";
import { Paginacion } from "@/components/notificaciones/ui";
import { IconSpark } from "@/components/icons";
import { SelectorAnio, BotonExcel, todasLasPaginas, Celda, useCatalogos, Aviso, MESES, MESES_CORTOS, anioActual, mesActual, hoyCO, fechaSinAnio, EstadoPago, TipoPago, Dinero } from "@/components/tesoreria/comun";
import { DetallePagoModal, PagoFormModal, ProponerModal } from "@/components/tesoreria/PagoModales";
import { ReplicarModal } from "@/components/tesoreria/PeriodicosTesoreria";

const PAGE_SIZES = [25, 50, 100];
// Pestañas de estado: [clave, texto, filtros que manda al backend]
const COLS_EXCEL = [
  { t: "Año", v: (p) => p.anio }, { t: "Mes", v: (p) => p.mes }, { t: "Vence", v: (p) => p.fecha }, { t: "Estado", v: (p) => p.estadoTexto },
  { t: "Tipo", v: (p) => `${p.tipo} · ${p.tipoTexto}` }, { t: "Ítem", v: (p) => p.item }, { t: "Concepto", v: (p) => p.concepto },
  { t: "Medio de pago", v: (p) => p.medioPago }, { t: "Paga", v: (p) => p.pagador }, { t: "Programado (COP, − egreso)", v: (p) => p.valor },
  { t: "Asociado (COP)", v: (p) => (p.movimientos ? p.asignado : null) }, { t: "Diferencia (COP)", v: (p) => p.diferencia }, { t: "Movimientos", v: (p) => p.movimientos },
  { t: "Periodicidad", v: (p) => p.periodicidad || "Extraordinario" }, { t: "Origen", v: (p) => p.origen }, { t: "Observación", v: (p) => p.observacion },
];
const TABS = [
  ["", "Todos", {}], ["P", "Pendientes", { estado: "P" }], ["E", "Pagados", { estado: "E" }],
  ["sinMov", "Pagados sin movimiento", { asociacion: "pagadoSinMovimiento" }], ["dif", "Con diferencia", { asociacion: "diferencia" }], ["vencidos", "Vencidos", { vencidos: "1" }],
];

function TarjetaFiltro({ on, onClick, titulo, children }) {
  return (
    <div className={`kpi tes-kpi-filtro${on ? " on" : ""}`} role="button" tabIndex={0} title={titulo} aria-pressed={on} onClick={onClick} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}>
      {children}
    </div>
  );
}

// Pagos programados (el «Detalle 2026» del Excel): mes a mes, con su estado P/E, los movimientos que los pagan y la
// diferencia. Un mes vacío ofrece «Proponer pagos con IA» y «Replicar pagos».
export default function PagosTesoreria({ acceso }) {
  const params = useSearchParams();
  const filtroIni = params.get("filtro") || "";
  const tabIni = filtroIni === "vencidos" ? "vencidos" : TABS.some((t) => t[0] === filtroIni) ? filtroIni : "";
  const { cat, error: errorCat } = useCatalogos();
  const [anio, setAnio] = useState(Number(params.get("anio")) || anioActual());
  const [mes, setMes] = useState(params.get("id") || filtroIni === "vencidos" || params.get("mes") === "todo" ? "" : Number(params.get("mes")) || mesActual());
  const [tab, setTab] = useState(tabIni);
  const [f, setF] = useState({ q: "", itemId: params.get("item") || "", medioPagoId: params.get("medio") || "", pagadorId: "", tipo: "", sentido: params.get("sentido") || "", ids: params.get("id") || "" });
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(PAGE_SIZES[0]);
  const [data, setData] = useState({ items: [], total: 0, totales: {} });
  const [conteos, setConteos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(params.get("id") ? { tipo: "detalle", id: Number(params.get("id")) } : null);
  const [aviso, setAviso] = useState("");
  const puedeRegistrar = !!acceso?.puedeRegistrar;

  useEffect(() => { const t = setTimeout(() => setF((x) => (x.q === q ? x : { ...x, q, ids: "" })), 350); return () => clearTimeout(t); }, [q]);
  useEffect(() => { setPage(1); }, [anio, mes, tab, f, size]);
  const cargarConteos = useCallback(() => tesResumen(anio, 12).then((r) => setConteos(r.porMes.map((m) => m.pagos))).catch(() => setConteos(null)), [anio]);
  useEffect(() => { cargarConteos(); }, [cargarConteos]);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const extra = TABS.find((t) => t[0] === tab)?.[2] || {};
      const r = await tesPagos({ ...f, anio: f.ids ? "" : anio, mes: f.ids ? "" : mes, ...extra, page, size });
      setData(r);
      if (r.page !== page) setPage(r.page);
      setError("");
    } catch (e) { setError(e.message); } finally { setCargando(false); }
  }, [f, anio, mes, tab, page, size]);
  useEffect(() => { cargar(); }, [cargar]);

  const cambio = (msg) => { if (msg) setAviso(msg); cargar(); cargarConteos(); };
  // Tocar una tarjeta filtra la tabla con los pagos que forman esa cifra; tocarla otra vez quita el filtro.
  const filtrarKpi = (sentido, nuevaTab) => crossfade(() => {
    const igual = f.sentido === sentido && tab === nuevaTab;
    setF((x) => ({ ...x, sentido: igual ? "" : sentido, ids: "" }));
    setTab(igual ? "" : nuevaTab);
    setPage(1);
  });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value, ids: "" }));
  const hoy = hoyCO();
  const t = data.totales || {};
  const mesVacio = !cargando && !f.ids && mes && conteos && conteos[mes - 1] === 0 && !tab && !f.q && !f.itemId && !f.medioPagoId && !f.pagadorId && !f.tipo;
  const nombreMes = mes ? `${MESES[mes - 1]} ${anio}` : `todo ${anio}`;

  return (
    <div className="tes-vista">
      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="tes-cabecera">
          <SelectorAnio id="pg-anio" value={anio} onChange={(a) => a && setAnio(a)} ancho={160} />
          <span className="card-sub" style={{ margin: 0 }}>Toca un mes; el número es cuántos pagos tiene.</span>
          <div className="spacer" />
          {puedeRegistrar && <button type="button" className="btn" onClick={() => setModal({ tipo: "proponer" })}><IconSpark size={13} /> Proponer pagos con IA</button>}
          {puedeRegistrar && <button type="button" className="btn btn-primary" onClick={() => setModal({ tipo: "nuevo" })} disabled={!cat}>+ Pago extraordinario</button>}
        </div>
        <div className="tes-meses">
          <button type="button" className={`tes-mes${!mes ? " on" : ""}`} onClick={() => crossfade(() => setMes(""))}><b>Todo</b><span>{conteos ? conteos.reduce((a, b) => a + b, 0) : "…"}</span></button>
          {MESES_CORTOS.map((m, i) => (
            <button key={m} type="button" className={`tes-mes${mes === i + 1 ? " on" : ""}${anio === anioActual() && i + 1 === mesActual() ? " hoy" : ""}`} onClick={() => crossfade(() => { setMes(i + 1); setF((x) => ({ ...x, ids: "" })); })}>
              <b>{m}</b><span>{conteos ? conteos[i] : "…"}</span>
            </button>
          ))}
        </div>
      </div>

      {mesVacio ? (
        <div className="card" style={{ textAlign: "center", padding: "36px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <h3 style={{ margin: 0 }}>{nombreMes} todavía no tiene pagos programados</h3>
          <p className="muted" style={{ maxWidth: 520, margin: 0 }}>Nova te los puede proponer con tus gastos periódicos y con lo que pagaste ese mes el año pasado, o puedes llenar todo el año de una vez.</p>
          {puedeRegistrar && <div className="tes-cabecera" style={{ justifyContent: "center" }}>
            <button type="button" className="btn btn-primary" onClick={() => setModal({ tipo: "proponer" })}><IconSpark size={13} /> Proponer pagos de {MESES[mes - 1].toLowerCase()}</button>
            <button type="button" className="btn" onClick={() => setModal({ tipo: "replicar" })}>Replicar pagos a {anio}</button>
          </div>}
        </div>
      ) : (
        <>
          <div className="kpi-row">
            <TarjetaFiltro on={f.sentido === "egreso" && tab !== "P"} onClick={() => filtrarKpi("egreso", "")} titulo="Ver los egresos que suman esta cifra">
              <span className="label">Egresos ({nombreMes})</span><span className="value"><Dinero valor={t.egresos || 0} texto={fmtMoneda(t.egresos || 0, "COP")} /></span>
              <span className={`foot tes-kpi-sub${f.sentido === "egreso" && tab === "P" ? " on" : ""}`} role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); filtrarKpi("egreso", "P"); }} onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); filtrarKpi("egreso", "P"); } }}>pendiente {fmtMoneda(t.pendienteEgresos || 0, "COP")}</span>
            </TarjetaFiltro>
            <TarjetaFiltro on={f.sentido === "ingreso" && tab !== "P"} onClick={() => filtrarKpi("ingreso", "")} titulo="Ver los ingresos que suman esta cifra">
              <span className="label">Ingresos ({nombreMes})</span><span className="value"><Dinero valor={t.ingresos || 0} texto={fmtMoneda(t.ingresos || 0, "COP")} /></span>
              <span className={`foot tes-kpi-sub${f.sentido === "ingreso" && tab === "P" ? " on" : ""}`} role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); filtrarKpi("ingreso", "P"); }} onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); filtrarKpi("ingreso", "P"); } }}>pendiente {fmtMoneda(t.pendienteIngresos || 0, "COP")}</span>
            </TarjetaFiltro>
            <div className={`kpi tes-kpi-filtro${!f.sentido && (tab === "P" || tab === "E") ? " on" : ""}`}>
              <span className="label">Pendientes · Pagados</span>
              <span className="value"><button type="button" className={`tes-kpi-num${!f.sentido && tab === "P" ? " on" : ""}`} onClick={() => filtrarKpi("", "P")} title="Ver los pendientes">{t.pendientes ?? 0}</button> · <button type="button" className={`tes-kpi-num${!f.sentido && tab === "E" ? " on" : ""}`} onClick={() => filtrarKpi("", "E")} title="Ver los pagados">{t.pagados ?? 0}</button></span>
              <span className="foot">toca un número para verlos</span>
            </div>
            <TarjetaFiltro on={!f.sentido && tab === "dif"} onClick={() => filtrarKpi("", "dif")} titulo="Ver los pagos con diferencia"><span className="label">Con diferencia</span><span className="value">{t.conDiferencia ?? 0}</span><span className="foot">lo asociado no da igual a lo programado</span></TarjetaFiltro>
          </div>

          <div className="card tes-filtros">
            <div className="dash-tabs" role="tablist" aria-label="Estado" style={{ flexWrap: "wrap" }}>
              {TABS.map(([k, txt]) => <button key={k || "todos"} type="button" role="tab" className="dash-tab" aria-selected={tab === k} onClick={() => crossfade(() => setTab(k))}>{txt}</button>)}
            </div>
            <div className="field" style={{ flex: "2 1 200px" }}><label htmlFor="pf-q">Buscar</label><input id="pf-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Concepto u observación" /></div>
            <div className="field" style={{ width: 150 }}><label htmlFor="pf-item">Ítem</label><select id="pf-item" value={f.itemId} onChange={set("itemId")}><option value="">Todos</option>{cat?.items.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></div>
            <div className="field" style={{ width: 150 }}><label htmlFor="pf-medio">Medio de pago</label><select id="pf-medio" value={f.medioPagoId} onChange={set("medioPagoId")}><option value="">Todos</option>{cat?.medios.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></div>
            <div className="field" style={{ width: 120 }}><label htmlFor="pf-paga">Paga</label><select id="pf-paga" value={f.pagadorId} onChange={set("pagadorId")}><option value="">Todos</option>{cat?.pagadores.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></div>
            <div className="tes-filtros-acciones"><BotonExcel nombre={`tesoreria-pagos-${anio}${mes ? `-${String(mes).padStart(2, "0")}` : ""}`} hoja="Pagos programados" columnas={COLS_EXCEL} obtener={() => todasLasPaginas(tesPagos, { ...f, anio: f.ids ? "" : anio, mes: f.ids ? "" : mes, ...(TABS.find((t) => t[0] === tab)?.[2] || {}) })} deshabilitado={!data.total} /></div>
            <div className="field" style={{ width: 130 }}><label htmlFor="pf-tipo">Tipo</label><select id="pf-tipo" value={f.tipo} onChange={set("tipo")}><option value="">Todos</option><option value="E">E · Egreso</option><option value="I">I · Ingreso</option><option value="J">J · Jornal</option><option value="S">S · Saldo</option><option value="T">T · Traslado</option></select></div>
          </div>
          {f.ids && <div className="tes-ayuda"><div>Mostrando solo el pago #{f.ids}.</div><button type="button" className="btn small" onClick={() => { setF((x) => ({ ...x, ids: "" })); setMes(mesActual()); }}>Ver todos</button></div>}
          {(error || errorCat) && <p className="modal-error">{error || errorCat}</p>}

          <div className={`table-card${cargando && data.items.length ? " tes-recargando" : ""}`}>
            <div className="table-scroll">
              <table className="records tes-tabla">
                <thead><tr><th>Estado</th><th>Vence</th><th>Ítem</th><th>Concepto</th><th>Tipo</th><th>Medio de pago</th><th>Paga</th><th style={{ textAlign: "right" }}>Programado</th><th>Movimientos</th><th style={{ textAlign: "right" }}>Diferencia</th></tr></thead>
                <tbody>
                  {cargando && !data.items.length && Array.from({ length: 8 }).map((_, i) => <tr key={`e${i}`} aria-hidden="true">{Array.from({ length: 10 }).map((__, j) => <td key={j}><div className="skeleton-bar" style={{ height: 12, borderRadius: 6, width: j === 3 ? 170 : 70 }} /></td>)}</tr>)}
                  {!cargando && !data.items.length && <tr><td colSpan={10}><EstadoVacio titulo={`No hay pagos en ${nombreMes}`}>Con otro filtro o mes puede que aparezcan. Para llenarlo usa «Proponer pagos con IA», «Replicar» o crea un pago extraordinario.</EstadoVacio></td></tr>}
                  {data.items.map((p) => {
                    const vencido = p.estado === "P" && p.fecha < hoy;
                    return (
                      <tr key={p.id} className="clickable" onClick={() => setModal({ tipo: "detalle", id: p.id })}>
                        <td><EstadoPago estado={p.estado} vencido={vencido} /></td>
                        <td title={p.fechaAproximada ? "Del Excel: solo se sabe el mes" : undefined}>{p.fechaAproximada ? MESES_CORTOS[p.mes - 1] : fechaSinAnio(p.fecha)}{!mes ? ` ${p.anio}` : ""}</td>
                        <td><Celda v={p.item} /></td>
                        <td><Celda v={p.concepto} ancha /></td>
                        <td><TipoPago tipo={p.tipo} /></td>
                        <td>{p.medioPago || <span className="muted">—</span>}</td>
                        <td>{p.pagador || <span className="muted">—</span>}</td>
                        <td style={{ textAlign: "right" }}>{p.valor === 0 ? <span className="pill warning" title="Vino en 0 del Excel: pon el valor real">COP 0</span> : <Dinero valor={p.valor} texto={p.valorTexto} fuerte />}</td>
                        <td>{p.movimientos ? `${p.movimientos} mov.` : <span className="muted">—</span>}</td>
                        <td style={{ textAlign: "right" }}>{p.diferencia == null ? <span className="muted">—</span> : Math.abs(p.diferencia) < 0.5 ? <span className="pill good">Cuadra</span> : <span className="pill warning">{p.diferencia > 0 ? "Faltan " : "Sobran "}{fmtMoneda(Math.abs(p.diferencia), "COP")}</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Paginacion id="tes-pagos-pagesize" page={page} size={size} total={data.total} sizes={PAGE_SIZES} onPage={setPage} onSize={setSize} etiqueta="pago(s)" />
          </div>
        </>
      )}

      {modal?.tipo === "detalle" && cat && <DetallePagoModal id={modal.id} cat={cat} puedeRegistrar={puedeRegistrar} onClose={() => setModal(null)} onCambio={cambio} />}
      {modal?.tipo === "nuevo" && cat && <PagoFormModal cat={cat} onClose={() => setModal(null)} onSaved={(_p, msg) => { setModal(null); cambio(msg); }} />}
      {modal?.tipo === "proponer" && <ProponerModal anio={anio} mes={mes || null} onClose={() => setModal(null)} onListo={(msg) => { setModal(null); cambio(msg); }} />}
      {modal?.tipo === "replicar" && <ReplicarModal anio={anio} onClose={() => setModal(null)} onListo={(msg) => { setModal(null); cambio(msg); }} />}
      <Aviso texto={aviso} onCerrar={() => setAviso("")} />
    </div>
  );
}
