"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { fmtDateTime } from "@/lib/format";
import { crossfade } from "@/lib/crossfade";
import { fetchBodegaApi, novaBodegaApi, crearArticuloApi, editarArticuloApi, fetchMovimientosArticuloApi, registrarMovimientoApi } from "@/lib/api";
import PiePagina, { usePagina } from "@/components/bienestar/PiePagina";
import { EsqueletoTabla } from "@/components/bienestar/Esqueletos";
import { IconPlus, IconEdit, IconHistory, IconSpark } from "@/components/icons";

const BODEGAS = [["bodega", "Bodega"], ["sst", "SST"], ["aseo", "Desechables y aseo"]];
const NOMBRE_BODEGA = Object.fromEntries(BODEGAS);
const num = (n) => Number(n || 0).toLocaleString("es-CO");
const fecha = (iso) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }) : "—");

// Semáforo de vencimiento, el mismo del Excel «Inventario Bodega»: 0–30 días por vencer, 31–70 alerta, 71+ vigente.
function Vence({ a }) {
  const d = a.diasParaVencer;
  if (d == null) return <span className="pill muted">Sin vencimiento</span>;
  if (d < 0) return <span className="pill critical">Vencido hace {num(-d)} d</span>;
  if (d <= 30) return <span className="pill critical">Vence en {d} d</span>;
  if (d <= 70) return <span className="pill warning">Alerta · {d} d</span>;
  return <span className="pill good">Vigente · {d} d</span>;
}
function Estado({ a }) {
  if (!a.activo) return <span className="pill muted">Inactivo</span>;
  if (a.stock <= 0) return <span className="pill critical">Agotado</span>;
  if (a.faltan > 0) return <span className="pill warning">Faltan {num(a.faltan)}</span>;
  return <span className="pill good">Disponible</span>;
}
// Orden de la tabla: de lo disponible a lo agotado (los inactivos al final).
const ORDEN_ESTADO = { disponible: 0, faltan: 1, agotado: 2, inactivo: 3 };
// Filtros de la tabla por estado y por vencimiento (mismas reglas que las píldoras de las columnas).
const ESTADOS = [["", "Todos los estados"], ["disponible", "Disponible"], ["faltan", "Faltan (bajo el mínimo)"], ["agotado", "Agotado"], ["inactivo", "Inactivo"]];
const estadoDe = (a) => (!a.activo ? "inactivo" : a.stock <= 0 ? "agotado" : a.faltan > 0 ? "faltan" : "disponible");
const VENCIMIENTOS = [["", "Todo vencimiento"], ["vencido", "Vencido"], ["porVencer", "Por vencer (0 a 30 días)"], ["alerta", "Alerta (31 a 70 días)"], ["vigente", "Vigente (71 días o más)"], ["sin", "Sin vencimiento"]];
const vencimientoDe = (a) => { const d = a.diasParaVencer; return d == null ? "sin" : d < 0 ? "vencido" : d <= 30 ? "porVencer" : d <= 70 ? "alerta" : "vigente"; };
const FILTROS = {
  todos: () => true,
  faltan: (a) => a.activo && a.faltan > 0,
  porVencer: (a) => a.activo && a.stock > 0 && a.diasParaVencer != null && a.diasParaVencer >= 0 && a.diasParaVencer <= 30,
  vencidos: (a) => a.activo && a.stock > 0 && a.diasParaVencer != null && a.diasParaVencer < 0,
  agotados: (a) => a.activo && a.stock <= 0,
};

// Inventario (bodega) de Bienestar: artículos por bodega con su stock, mínimo y vencimiento. Cada cambio del stock es
// un movimiento (entrada, salida, ajuste por conteo) y queda en el historial del artículo; las compras de Compras lo
// alimentan y las actividades lo consumen desde su ficha.
const sinTildes = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const IconoLupa = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
);

export default function InventarioBodegaView({ puedeEditar }) {
  const [articulos, setArticulos] = useState(null);
  const [error, setError] = useState("");
  const [bodega, setBodega] = useState("bodega");
  const [filtro, setFiltro] = useState("todos");
  const [q, setQ] = useState("");
  const [fEstado, setFEstado] = useState("");
  const [fVence, setFVence] = useState("");
  // «Buscar con Nova»: el pedido, si está pensando y lo que aplicó (o por qué no pudo).
  const [pedido, setPedido] = useState("");
  const [nova, setNova] = useState({ estado: "" });
  const [mov, setMov] = useState(null); // { articulo, tipo }
  const [hist, setHist] = useState(null); // articulo
  const [editar, setEditar] = useState(null); // articulo | {} (nuevo)
  const [aviso, setAviso] = useState("");

  const cargar = useCallback(() => {
    fetchBodegaApi().then((r) => setArticulos(r.articulos)).catch((e) => setError(e.message || "No se pudo cargar el inventario."));
  }, []);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { if (!aviso) return undefined; const t = setTimeout(() => setAviso(""), 3500); return () => clearTimeout(t); }, [aviso]);

  const deBodega = useMemo(() => (articulos || []).filter((a) => a.bodega === bodega), [articulos, bodega]);
  // Buscador: con texto busca en las TRES bodegas (sin tildes ni mayúsculas, cada palabra por separado) y cada fila dice
  // de qué bodega es; sin texto se ve solo la bodega de la pestaña.
  const terminos = useMemo(() => sinTildes(q).split(/\s+/).filter(Boolean), [q]);
  const buscando = terminos.length > 0;
  const filtradas = useMemo(() => {
    const base = buscando ? articulos || [] : deBodega;
    // Orden fijo: disponibles, luego bajo el mínimo, agotados e inactivos; dentro de cada estado por nombre.
    return base.filter((a) => FILTROS[filtro](a) && (!fEstado || estadoDe(a) === fEstado) && (!fVence || vencimientoDe(a) === fVence) && (!buscando || terminos.every((t) => sinTildes(`${a.producto} ${a.referencia || ""} ${a.unidad || ""} ${NOMBRE_BODEGA[a.bodega] || ""}`).includes(t)))).sort((x, y) => (ORDEN_ESTADO[estadoDe(x)] ?? 9) - (ORDEN_ESTADO[estadoDe(y)] ?? 9) || String(x.producto).localeCompare(String(y.producto), "es"));
  }, [articulos, deBodega, filtro, terminos, buscando, fEstado, fVence]);
  const pag = usePagina(filtradas, `${bodega}|${filtro}|${q}|${fEstado}|${fVence}`);
  const hayFiltros = !!(fEstado || fVence);
  async function buscarConNova(e) {
    e.preventDefault();
    if (!pedido.trim()) return;
    setNova({ estado: "pensando" });
    try {
      const r = await novaBodegaApi(pedido);
      if (!r.aplicable) { setNova({ estado: "no", motivo: r.motivo }); return; }
      const x = r.filtros;
      if (x.bodega) setBodega(x.bodega);
      setFiltro("todos"); setFEstado(x.estado || ""); setFVence(x.vencimiento || ""); setQ(x.texto || "");
      const chips = [x.bodega ? NOMBRE_BODEGA[x.bodega] : x.texto ? "Todas las bodegas" : null, ESTADOS.find(([k]) => k === x.estado)?.[1], VENCIMIENTOS.find(([k]) => k === x.vencimiento)?.[1], x.texto ? `«${x.texto}»` : null].filter((c) => c && !/^Todo/.test(c));
      setNova({ estado: "ok", chips });
    } catch (err) { setNova({ estado: "no", motivo: `No pude consultar a Nova (${err.message}).` }); }
  }
  const limpiarNova = () => { setNova({ estado: "" }); setPedido(""); setFEstado(""); setFVence(""); setQ(""); };
  const maxStock = Math.max(1, ...deBodega.map((a) => Math.max(a.stock, a.minimo || 0)));
  const lotes = useMemo(() => {
    const m = new Map();
    for (const a of articulos || []) { const k = `${a.bodega}|${a.producto}`; m.set(k, [...(m.get(k) || []), a.id]); }
    return m;
  }, [articulos]);
  const cuenta = (f) => deBodega.filter(FILTROS[f]).length;

  if (error) return <div className="modal-error">{error}</div>;
  if (!articulos) return <EsqueletoTabla etiqueta="Cargando el inventario" />;

  const kpi = (f, etiqueta, valor, sub, color) => (
    <button type="button" className={`inv-kpi${filtro === f ? " activo" : ""}`} style={{ "--k": color }} onClick={() => setFiltro(filtro === f ? "todos" : f)} aria-pressed={filtro === f}>
      <span>{etiqueta}</span><strong>{valor}</strong><small>{sub}</small>
    </button>
  );

  return (
    <div className="inv">
      <div className="inv-cab">
        <p>Lo que hay en bodega para las actividades. Las compras lo alimentan (desde el formulario de la compra) y las actividades lo consumen (desde su sección Inventario). Cada cambio queda en el historial del artículo.</p>
        {puedeEditar && <button type="button" className="btn btn-primary" onClick={() => setEditar({})}><IconPlus size={13} /> Nuevo artículo</button>}
      </div>

      <div className="inv-kpis">
        {kpi("todos", "Artículos", num(deBodega.length), `${num(deBodega.reduce((s, a) => s + a.stock, 0))} unidades en esta bodega`, "var(--accent)")}
        {kpi("faltan", "Por reponer", num(cuenta("faltan")), "Por debajo de su mínimo", "var(--warning)")}
        {kpi("porVencer", "Por vencer", num(cuenta("porVencer")), "En 30 días o menos", "var(--critical)")}
        {kpi("vencidos", "Vencidos con stock", num(cuenta("vencidos")), "Revisar y dar de baja", "var(--critical)")}
        {kpi("agotados", "Agotados", num(cuenta("agotados")), "Stock en cero", "var(--muted)")}
      </div>
      {aviso && <div className="ficha-aviso" role="status">{aviso}</div>}

      <div className="table-card">
        <form className="inv-nova" onSubmit={buscarConNova}>
          <span className="inv-nova-ic" aria-hidden="true"><IconSpark size={16} /></span>
          <input aria-label="Buscar con Nova" value={pedido} onChange={(e) => setPedido(e.target.value)} maxLength={300} placeholder="Pregúntale a Nova: «lo de aseo que vence este mes» o «qué falta reponer en SST»" />
          <button type="submit" className="btn btn-primary" disabled={!pedido.trim() || nova.estado === "pensando"}>{nova.estado === "pensando" ? <span className="spinner" /> : <IconSpark size={13} />} Buscar con Nova</button>
        </form>
        {nova.estado === "ok" && <div className="inv-nova-res" role="status"><span>Nova filtró:</span>{nova.chips.length ? nova.chips.map((c) => <span key={c} className="pill accent">{c}</span>) : <span>todo el inventario</span>}<span style={{ marginLeft: "auto" }}>{filtradas.length} artículo(s)</span><button type="button" className="btn small" onClick={limpiarNova}>Quitar</button></div>}
        {nova.estado === "no" && <div className="inv-nova-res" role="alert"><span><strong>No pude buscar eso.</strong> {nova.motivo}</span></div>}
        <div className="inv-barra">
          <div className="dash-tabs" role="tablist" aria-label="Bodegas">
            {BODEGAS.map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={bodega === k} className="dash-tab" onClick={() => crossfade(() => { setBodega(k); setFiltro("todos"); })}>
                {l} <span className="inv-cuenta">{(articulos || []).filter((a) => a.bodega === k).length}</span>
              </button>
            ))}
          </div>
          <label className="inv-buscar">
            <IconoLupa />
            <input type="search" aria-label="Buscar artículo en todas las bodegas" placeholder="Buscar artículo, referencia o unidad…" value={q} onChange={(e) => setQ(e.target.value)} />
            {buscando && <span className="inv-buscar-n">{filtradas.length} en todas las bodegas</span>}
          </label>
          <div className="inv-filtros">
            <select aria-label="Filtrar por estado" value={fEstado} onChange={(e) => setFEstado(e.target.value)} className={fEstado ? "activo" : ""}>{ESTADOS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            <select aria-label="Filtrar por vencimiento" value={fVence} onChange={(e) => setFVence(e.target.value)} className={fVence ? "activo" : ""}>{VENCIMIENTOS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            {hayFiltros && <button type="button" className="btn small" onClick={() => { setFEstado(""); setFVence(""); }}>Quitar filtros</button>}
          </div>
        </div>
        <div className="table-scroll">
          <table className="records inv-tabla">
            <thead>
              <tr><th>Artículo</th><th className="num">Inicial</th><th className="num">Entradas</th><th className="num">Salidas</th><th>Stock actual</th><th className="num">Mínimo</th><th>Estado</th><th>Vencimiento</th><th className="actions-col">Acciones</th></tr>
            </thead>
            <tbody>
              {pag.pagina.length === 0 && <tr><td colSpan={9}><div className="empty">{buscando ? `Ningún artículo de ninguna bodega coincide con «${q.trim()}». Prueba con otra palabra${filtro !== "todos" ? " o quita el filtro" : ""}.` : deBodega.length ? "Ningún artículo coincide con los filtros." : "Esta bodega aún no tiene artículos."}</div></td></tr>}
              {pag.pagina.map((a) => {
                const l = lotes.get(`${a.bodega}|${a.producto}`) || [];
                return (
                  <tr key={a.id} className={a.activo ? "" : "inv-inactivo"}>
                    <td>
                      <span className="inv-prod">
                        <span className="desc-tooltip-wrap"><span className="desc-text">{a.producto}</span><span className="desc-tooltip-bubble">{a.producto}</span></span>
                        <small>{[buscando ? NOMBRE_BODEGA[a.bodega] : null, a.referencia ? `Ref. ${a.referencia}` : null, a.unidad, l.length > 1 ? `lote ${l.indexOf(a.id) + 1} de ${l.length}` : null].filter(Boolean).join(" · ")}</small>
                      </span>
                    </td>
                    <td className="num">{num(a.inicial)}</td>
                    <td className="num">{num(a.entradas)}</td>
                    <td className="num">{num(a.salidas)}</td>
                    <td>
                      <span className="inv-stock">
                        <strong>{num(a.stock)}</strong>
                        <span className="inv-mini"><i className={a.stock <= 0 ? "cero" : a.faltan > 0 ? "bajo" : ""} style={{ width: `${Math.min(100, (a.stock / maxStock) * 100)}%` }} /></span>
                      </span>
                    </td>
                    <td className="num">{a.minimo != null ? num(a.minimo) : "—"}</td>
                    <td><Estado a={a} /></td>
                    <td><Vence a={a} /></td>
                    <td className="actions-cell">
                      <div className="row-actions">
                        {puedeEditar && a.activo && <button type="button" className="icon-action-btn" title="Registrar entrada" aria-label={`Registrar entrada de ${a.producto}`} onClick={() => setMov({ articulo: a, tipo: "entrada" })}>+</button>}
                        {puedeEditar && a.activo && <button type="button" className="icon-action-btn" title="Registrar salida" aria-label={`Registrar salida de ${a.producto}`} onClick={() => setMov({ articulo: a, tipo: "salida" })} disabled={a.stock <= 0}>−</button>}
                        <button type="button" className="icon-action-btn" title="Historial" aria-label={`Historial de ${a.producto}`} onClick={() => setHist(a)}><IconHistory size={13} /></button>
                        {puedeEditar && <button type="button" className="icon-action-btn" title="Editar artículo" aria-label={`Editar ${a.producto}`} onClick={() => setEditar(a)}><IconEdit size={13} /></button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <PiePagina id="inv-size" p={pag} total={filtradas.length} etiqueta="artículo(s)" excel={{ nombre: `inventario-${buscando ? "todas-las-bodegas" : bodega}`, hoja: "Inventario", filas: filtradas, columnas: [
          { t: "Bodega", v: (a) => NOMBRE_BODEGA[a.bodega] || a.bodega }, { t: "Artículo", v: (a) => a.producto }, { t: "Referencia", v: (a) => a.referencia }, { t: "Unidad", v: (a) => a.unidad },
          { t: "Inicial", v: (a) => a.inicial }, { t: "Entradas", v: (a) => a.entradas }, { t: "Salidas", v: (a) => a.salidas }, { t: "Stock actual", v: (a) => a.stock }, { t: "Mínimo", v: (a) => a.minimo },
          { t: "Estado", v: (a) => (!a.activo ? "Inactivo" : a.stock <= 0 ? "Agotado" : a.faltan > 0 ? `Faltan ${a.faltan}` : "Disponible") },
          { t: "Vence", v: (a) => a.vence }, { t: "Días para vencer", v: (a) => a.diasParaVencer },
        ] }} />
      </div>
      <p className="count-note inv-leyenda">
        <span className="pill critical">0 a 30 días · por vencer</span> <span className="pill warning">31 a 70 días · alerta</span> <span className="pill good">71 días o más · vigente</span> El mismo semáforo del Excel. Para que aparezca «Faltan», define el mínimo del artículo con el lápiz.
      </p>

      {mov && <ModalMovimiento {...mov} onClose={() => setMov(null)} onListo={(a, txt) => { setMov(null); setAviso(txt); cargar(); if (hist?.id === a.id) setHist(a); }} />}
      {hist && <PanelHistorial articulo={hist} puedeEditar={puedeEditar} onClose={() => setHist(null)} onMovimiento={(tipo) => setMov({ articulo: hist, tipo })} />}
      {editar && <ModalArticulo articulo={editar.id ? editar : null} bodega={bodega} onClose={() => setEditar(null)} onListo={(a, txt) => { setEditar(null); setAviso(txt); if (!editar.id) { setBodega(a.bodega); setFiltro("todos"); } cargar(); }} />}
    </div>
  );
}

function useEsc(onClose, bloqueado) {
  useEffect(() => {
    const k = (e) => { if (e.key === "Escape" && !bloqueado) onClose(); };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onClose, bloqueado]);
}

function ModalMovimiento({ articulo: a, tipo: tipoInicial, onClose, onListo }) {
  const [tipo, setTipo] = useState(tipoInicial);
  const [cantidad, setCantidad] = useState("");
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const campo = useRef(null);
  useEsc(onClose, guardando);
  useEffect(() => { campo.current?.focus(); }, [tipo]);
  const c = Math.max(0, Math.floor(Number(cantidad) || 0));
  const despues = tipo === "entrada" ? a.stock + c : tipo === "salida" ? a.stock - c : c;
  const falta = despues < 0;

  async function guardar(e) {
    e.preventDefault();
    if (!cantidad && tipo !== "ajuste") { setError("Escribe la cantidad."); return; }
    if (falta) return;
    setGuardando(true);
    setError("");
    try {
      const r = await registrarMovimientoApi(a.id, tipo === "ajuste" ? { tipo, conteo: c, motivo } : { tipo, cantidad: c, motivo });
      onListo(r.articulo, `${r.articulo.producto}: ahora hay ${num(r.articulo.stock)}.`);
    } catch (err) {
      setError(err.message || "No se pudo registrar el movimiento.");
      setGuardando(false);
    }
  }

  return (
    <div className="modal-overlay inv-fondo" onMouseDown={(e) => { if (e.target === e.currentTarget && !guardando) onClose(); }}>
      <form className="modal inv-modal" role="dialog" aria-modal="true" aria-labelledby="inv-mov-t" onSubmit={guardar} noValidate>
        <div className="modal-head">
          <div><h3 id="inv-mov-t">{a.producto}</h3><span className="count-note">{a.bodegaNombre}{a.vence ? ` · vence ${fecha(a.vence)}` : ""}</span></div>
          <button type="button" className="btn-ghost icon-btn" onClick={onClose} disabled={guardando} aria-label="Cerrar">✕</button>
        </div>
        <div className="inv-modal-cuerpo">
          <div className="inv-tipos" role="radiogroup" aria-label="Tipo de movimiento">
            {[["entrada", "Entrada", "Llegó mercancía"], ["salida", "Salida", "Se usó o se dañó"], ["ajuste", "Ajuste", "Conteo físico"]].map(([k, l, s]) => (
              <button key={k} type="button" role="radio" aria-checked={tipo === k} className={tipo === k ? "activo" : ""} onClick={() => { setTipo(k); setError(""); }}>{l}<small>{s}</small></button>
            ))}
          </div>
          <div className="field">
            <label htmlFor="inv-cant">{tipo === "ajuste" ? "¿Cuántas hay en el conteo?" : "Cantidad"}</label>
            <input id="inv-cant" ref={campo} type="number" min="0" step="1" inputMode="numeric" className="inv-num" value={cantidad} onChange={(e) => { setCantidad(e.target.value); setError(""); }} />
          </div>
          <div className="field">
            <label htmlFor="inv-mot">Motivo <small>(opcional)</small></label>
            <input id="inv-mot" type="text" maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder={tipo === "salida" ? "Ej.: se dañó en el transporte" : tipo === "ajuste" ? "Ej.: conteo de fin de mes" : "Ej.: donación"} />
          </div>
          <div className="inv-antes-despues" aria-live="polite">
            <div><span>Hay</span><strong>{num(a.stock)}</strong></div>
            <span aria-hidden="true">→</span>
            <div><span>Quedarán</span><strong className={falta ? "mal" : "bien"}>{num(despues)}</strong></div>
          </div>
          {falta && <div className="modal-error" role="alert">No hay suficiente: solo quedan {num(a.stock)}.</div>}
          {error && <div className="modal-error" role="alert">{error}</div>}
        </div>
        <div className="modal-foot">
          <button type="submit" className="btn btn-primary" disabled={guardando || falta}>{guardando && <span className="spinner" />} Registrar</button>
          <button type="button" className="btn" onClick={onClose} disabled={guardando}>Cancelar</button>
        </div>
      </form>
    </div>
  );
}

const ETIQUETA = { inicial: "Saldo inicial", entrada: "Entrada", salida: "Salida", ajuste: "Ajuste por conteo", devolucion: "Devolución" };

function PanelHistorial({ articulo, puedeEditar, onClose, onMovimiento }) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  useEsc(onClose, false);
  useEffect(() => {
    let vigente = true;
    fetchMovimientosArticuloApi(articulo.id).then((r) => { if (vigente) setDatos(r); }).catch((e) => { if (vigente) setError(e.message || "No se pudo cargar el historial."); });
    return () => { vigente = false; };
  }, [articulo.id, articulo.stock]);
  const movs = datos?.movimientos || [];
  const pag = usePagina(movs, String(articulo.id), 10);
  const a = datos?.articulo || articulo;

  return (
    <div className="inv-lado" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="inv-panel" role="dialog" aria-modal="true" aria-labelledby="inv-hist-t">
        <div className="modal-head">
          <div><h3 id="inv-hist-t">{a.producto}</h3><span className="count-note">Historial de movimientos · stock actual <b>{num(a.stock)}</b></span></div>
          <button type="button" className="btn-ghost icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div className="inv-panel-cuerpo">
          {error && <div className="modal-error">{error}</div>}
          {!datos && !error && <EsqueletoTabla etiqueta="Cargando el historial" />}
          {datos && movs.length === 0 && <p className="count-note">Este artículo aún no tiene movimientos.</p>}
          <ol className="inv-linea">
            {pag.pagina.map((m) => (
              <li key={m.id} className={`t-${m.tipo}`}>
                <i aria-hidden="true" />
                <div>
                  <b>{ETIQUETA[m.tipo] || m.tipo}</b>
                  {m.compra && <> · <Link href={`/registros?id=${m.compra.id}`}>compra #{m.compra.localSeq ?? "—"}</Link></>}
                  {m.actividad && <> · <Link href={`${m.actividad.linea === "Fundación" ? "/bienestar/fundacion" : "/bienestar"}/actividades/${m.actividad.id}?tab=inventario`}>{m.actividad.nombre}</Link></>}
                  {m.motivo && !m.compra && !m.actividad && <span className="inv-motivo"> · {m.motivo}</span>}
                  <small>{fmtDateTime(m.createdAt)} · {m.creadoPorNombre || "—"} · stock {num(m.stockAntes)} → {num(m.stockDespues)}</small>
                </div>
                <strong className={m.cantidad < 0 ? "menos" : "mas"}>{m.cantidad > 0 ? "+" : ""}{num(m.cantidad)}</strong>
              </li>
            ))}
          </ol>
          {movs.length > 0 && <PiePagina id="inv-hist-size" p={pag} total={movs.length} etiqueta="movimiento(s)" tamanos={[10, 25, 50, 100]} />}
        </div>
        {puedeEditar && a.activo && (
          <div className="modal-foot">
            <button type="button" className="btn" onClick={() => onMovimiento("salida")} disabled={a.stock <= 0}>Registrar salida</button>
            <button type="button" className="btn btn-primary" onClick={() => onMovimiento("entrada")}>Registrar entrada</button>
          </div>
        )}
      </aside>
    </div>
  );
}

function ModalArticulo({ articulo, bodega, onClose, onListo }) {
  const nuevo = !articulo;
  const [f, setF] = useState({
    producto: articulo?.producto || "", bodega: articulo?.bodega || bodega, unidad: articulo?.unidad || "Unidad",
    referencia: articulo?.referencia || "", minimo: articulo?.minimo ?? "", vence: articulo?.vence || "", activo: articulo?.activo !== false,
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  useEsc(onClose, guardando);
  const set = (k, v) => { setF((x) => ({ ...x, [k]: v })); setError(""); };

  async function guardar(e) {
    e.preventDefault();
    if (!f.producto.trim()) { setError("Escribe el nombre del artículo."); return; }
    setGuardando(true);
    try {
      const data = { ...f, minimo: f.minimo === "" ? null : Number(f.minimo), vence: f.vence || null };
      const r = nuevo ? await crearArticuloApi(data) : await editarArticuloApi(articulo.id, data);
      onListo(r.articulo, nuevo ? `«${r.articulo.producto}» quedó en el inventario con stock 0.` : "Artículo actualizado.");
    } catch (err) {
      setError(err.message || "No se pudo guardar el artículo.");
      setGuardando(false);
    }
  }

  return (
    <div className="modal-overlay inv-fondo" onMouseDown={(e) => { if (e.target === e.currentTarget && !guardando) onClose(); }}>
      <form className="modal inv-modal" role="dialog" aria-modal="true" aria-labelledby="inv-art-t" onSubmit={guardar} noValidate>
        <div className="modal-head">
          <div><h3 id="inv-art-t">{nuevo ? "Nuevo artículo" : "Editar artículo"}</h3><span className="count-note">{nuevo ? "Queda en cero hasta que llegue por una compra o una entrada." : "El stock no se cambia aquí: usa una entrada, una salida o un ajuste."}</span></div>
          <button type="button" className="btn-ghost icon-btn" onClick={onClose} disabled={guardando} aria-label="Cerrar">✕</button>
        </div>
        <div className="inv-modal-cuerpo">
          <div className="field"><label htmlFor="ia-nom">Nombre</label><input id="ia-nom" type="text" maxLength={200} value={f.producto} onChange={(e) => set("producto", e.target.value)} placeholder="Ej.: Galletas Saltín" autoFocus /></div>
          <div className="inv-campos">
            <div className="field"><label htmlFor="ia-bod">Bodega</label><select id="ia-bod" value={f.bodega} onChange={(e) => set("bodega", e.target.value)}>{BODEGAS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
            <div className="field"><label htmlFor="ia-um">Unidad</label><input id="ia-um" type="text" maxLength={40} value={f.unidad} onChange={(e) => set("unidad", e.target.value)} /></div>
            <div className="field"><label htmlFor="ia-min">Mínimo <small>(avisa «Faltan»)</small></label><input id="ia-min" type="number" min="0" step="1" className="inv-num" value={f.minimo} onChange={(e) => set("minimo", e.target.value)} placeholder="Sin mínimo" /></div>
            <div className="field"><label htmlFor="ia-ven">Vence</label><input id="ia-ven" type="date" value={f.vence} onChange={(e) => set("vence", e.target.value)} /></div>
            <div className="field"><label htmlFor="ia-ref">Referencia <small>(opcional)</small></label><input id="ia-ref" type="text" maxLength={60} value={f.referencia} onChange={(e) => set("referencia", e.target.value)} /></div>
          </div>
          {!nuevo && (
            <label htmlFor="ia-act" className="actividad-check">
              <span>Activo (si lo desactivas deja de aparecer para sacar en las actividades y en las compras)</span>
              <input id="ia-act" type="checkbox" checked={f.activo} onChange={(e) => set("activo", e.target.checked)} />
            </label>
          )}
          {error && <div className="modal-error" role="alert">{error}</div>}
        </div>
        <div className="modal-foot">
          <button type="submit" className="btn btn-primary" disabled={guardando}>{guardando && <span className="spinner" />} {nuevo ? "Crear artículo" : "Guardar cambios"}</button>
          <button type="button" className="btn" onClick={onClose} disabled={guardando}>Cancelar</button>
        </div>
      </form>
    </div>
  );
}
