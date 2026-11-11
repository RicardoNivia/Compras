"use client";

import EstadoVacio from "@/components/EstadoVacio";
import { useCallback, useEffect, useState } from "react";
import { crossfade } from "@/lib/crossfade";
import { urlReporteExcel } from "@/lib/tesoreriaApi";
import { IconChevronDown, IconDownload } from "@/components/icons";
import { useCatalogos, anioActual, useAniosTesoreria } from "@/components/tesoreria/comun";
import { FilasEsqueleto } from "@/components/tesoreria/Esqueletos";
import { Portal, Paginacion } from "@/components/notificaciones/ui";
import { DetallePagoModal } from "@/components/tesoreria/PagoModales";
import { Celda, EstadoPago, TipoPago, Dinero, fechaCorta } from "@/components/tesoreria/comun";

// Las hojas «Ejecutado» y «Por medio de pago» del Excel, como tablas dinámicas sobre los pagos programados: grupos que
// se abren y cierran (+/−), meses en columnas, subtotal por grupo y total general. Cifras calculadas en el backend
// (lib/tesoreria/pivote.js), una tabla por moneda ISO 4217; egresos en negativo, como en el Excel.
const PAGE_SIZES = [25, 50, 100];
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const VISTAS = [["ejecutado", "Ejecutado"], ["medio", "Por medio de pago"]];
const MESES_LARGOS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const filtrosIniciales = () => ({ anio: anioActual(), estado: "E", tipo: "", pagadorId: "", medioPagoId: "", itemId: "", mesDesde: 1, mesHasta: 12, todosLosTipos: false });
const fmt = (v) => (v ? Math.round(v).toLocaleString("es-CO") : "");

// Aplana el árbol en filas visibles según lo que esté abierto.
function filas(nodo, abiertos, ruta = [], nivel = 0, out = []) {
  for (const h of nodo.hijos) {
    const clave = [...ruta, h.nombre].join("›");
    const tieneHijos = h.hijos.length > 0;
    out.push({ clave, ruta: [...ruta, h.nombre].slice(1), nombre: h.nombre, nivel, meses: h.meses, total: h.total, tieneHijos, abierto: abiertos.has(clave) });
    if (tieneHijos && abiertos.has(clave)) filas(h, abiertos, [...ruta, h.nombre], nivel + 1, out);
  }
  return out;
}
function todasLasClaves(nodo, ruta = [], out = []) {
  for (const h of nodo.hijos) {
    const clave = [...ruta, h.nombre].join("›");
    if (h.hijos.length) { out.push(clave); todasLasClaves(h, [...ruta, h.nombre], out); }
  }
  return out;
}

// Parámetros de la consulta (los usan la tabla y el detalle de una celda).
export function consultaDe(f, vista) {
  return new URLSearchParams({
    anio: f.anio, vista, mesDesde: f.mesDesde, mesHasta: f.mesHasta,
    estado: f.estado || "todos", ...(f.tipo ? { tipo: f.tipo } : {}), ...(f.pagadorId ? { pagadorId: f.pagadorId } : {}),
    ...(f.medioPagoId ? { medioPagoId: f.medioPagoId } : {}), ...(f.itemId ? { itemId: f.itemId } : {}), ...(f.todosLosTipos && !f.tipo ? { todosLosTipos: "1" } : {}),
  });
}

export default function ReportesTesoreria({ acceso }) {
  const aniosTes = useAniosTesoreria(); // años anteriores solo si tienen pagos
  const { cat } = useCatalogos();
  const [vista, setVista] = useState("ejecutado");
  const [f, setF] = useState(filtrosIniciales);
  // Celda en la que se hizo clic: { moneda, ruta, mes, titulo } → ventana con sus movimientos.
  const [celda, setCelda] = useState(null);
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [abiertos, setAbiertos] = useState(new Set());
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(PAGE_SIZES[2]);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    const q = consultaDe(f, vista);
    fetch(`/api/tesoreria/reportes?${q}`, { cache: "no-store" })
      .then(async (r) => { const b = await r.json(); if (!r.ok) throw new Error(b.error || `Error ${r.status}`); return b; })
      .then((b) => {
        if (!vivo) return;
        setDatos(b); setError("");
        // Como la hoja: todo abierto al cargar (se puede contraer).
        setAbiertos(new Set(b.porMoneda.flatMap((m) => todasLasClaves(m, [m.moneda]))));
      })
      .catch((e) => vivo && setError(e.message))
      .finally(() => vivo && setCargando(false));
    return () => { vivo = false; };
  }, [vista, f]);
  useEffect(() => { setPage(1); }, [vista, f, size]);

  const set = (k) => (e) => {
    const v = e.target.type === "checkbox" ? e.target.checked : ["mesDesde", "mesHasta"].includes(k) ? Number(e.target.value) : e.target.value;
    setF((x) => ({ ...x, [k]: v }));
  };
  const hayFiltros = vista !== "ejecutado" || JSON.stringify(f) !== JSON.stringify(filtrosIniciales());
  const limpiar = () => { setVista("ejecutado"); setF(filtrosIniciales()); };

  const alternar = (clave) => setAbiertos((s) => { const n = new Set(s); n.has(clave) ? n.delete(clave) : n.add(clave); return n; });
  const expandir = () => datos && setAbiertos(new Set(datos.porMoneda.flatMap((m) => todasLasClaves(m, [m.moneda]))));
  // Contraer deja ver solo el primer nivel (Tipo o Cuenta), como «Collapse entire field» del Excel.
  const contraer = () => setAbiertos(new Set());

  return (
    <div className="tes-vista">
      <div className="card tes-filtros tes-piv-filtros">
        <div className="dash-tabs" role="tablist" aria-label="Hoja">
          {VISTAS.map(([k, t]) => <button key={k} type="button" role="tab" className="dash-tab" aria-selected={vista === k} onClick={() => crossfade(() => setVista(k))}>{t}</button>)}
        </div>
        <div className="field" style={{ width: 100 }}>
          <label htmlFor="tp-anio">Año</label>
          <select id="tp-anio" value={f.anio} onChange={set("anio")}>{[...new Set([...(aniosTes || []), Number(f.anio) || anioActual()])].sort((x, y) => x - y).map((a) => <option key={a}>{a}</option>)}</select>
        </div>
        <div className="field" style={{ width: 140 }}>
          <label htmlFor="tp-estado">Estado</label>
          <select id="tp-estado" value={f.estado} onChange={set("estado")}><option value="E">Pagados (E)</option><option value="P">Pendientes (P)</option><option value="">Todos</option></select>
        </div>
        <div className="field" style={{ width: 130 }}>
          <label htmlFor="tp-tipo">Tipo</label>
          <select id="tp-tipo" value={f.tipo} onChange={set("tipo")}><option value="">I, E y J</option><option value="E">Egresos</option><option value="I">Ingresos</option><option value="J">Jornal</option><option value="S">Saldos</option><option value="T">Traslados</option></select>
        </div>
        <div className="field" style={{ width: 160 }}>
          <label htmlFor="tp-item">Ítem</label>
          <select id="tp-item" value={f.itemId} onChange={set("itemId")}><option value="">(Todos)</option>{cat?.items.map((i) => <option key={i.id} value={i.id}>{i.nombre}</option>)}</select>
        </div>
        <div className="field" style={{ width: 120 }}>
          <label htmlFor="tp-desde">Desde</label>
          <select id="tp-desde" value={f.mesDesde} onChange={set("mesDesde")}>{MESES_LARGOS.map((m, i) => <option key={m} value={i + 1} disabled={i + 1 > f.mesHasta}>{m}</option>)}</select>
        </div>
        <div className="field" style={{ width: 120 }}>
          <label htmlFor="tp-hasta">Hasta</label>
          <select id="tp-hasta" value={f.mesHasta} onChange={set("mesHasta")}>{MESES_LARGOS.map((m, i) => <option key={m} value={i + 1} disabled={i + 1 < f.mesDesde}>{m}</option>)}</select>
        </div>
        <div className="field" style={{ width: 140 }}>
          <label htmlFor="tp-paga">Paga</label>
          <select id="tp-paga" value={f.pagadorId} onChange={set("pagadorId")}><option value="">(Todos)</option>{cat?.pagadores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select>
        </div>
        <div className="field" style={{ width: 170 }}>
          <label htmlFor="tp-medio">Medio de pago</label>
          <select id="tp-medio" value={f.medioPagoId} onChange={set("medioPagoId")}><option value="">(Todos)</option>{cat?.medios.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select>
        </div>
        <label className="tes-check tes-piv-check" title={f.tipo ? "Con un tipo elegido solo sale ese tipo" : undefined}><span>Incluir saldos y traslados (S y T no suman)</span><input type="checkbox" checked={f.todosLosTipos && !f.tipo} disabled={!!f.tipo} onChange={set("todosLosTipos")} /></label>
        <div className="tes-filtros-acciones">
          <button type="button" className="btn small" onClick={limpiar} disabled={!hayFiltros}>Limpiar filtros</button>
          <button type="button" className="btn small" onClick={expandir} disabled={!datos}>Expandir todo</button>
          <button type="button" className="btn small" onClick={contraer} disabled={!datos}>Contraer todo</button>
          <a className="btn small btn-primary" href={urlReporteExcel(f.anio, f.estado || "todos")}><IconDownload size={13} /> Excel {f.anio}</a>
        </div>
      </div>

      {error && <p className="modal-error">{error}</p>}
      {cargando && !datos && <div className="table-card"><FilasEsqueleto filas={12} columnas={8} /></div>}
      {datos && !datos.porMoneda.length && <div className="card"><EstadoVacio titulo="No hay pagos con estos filtros">Cambia el año, los tipos o las filas del reporte.</EstadoVacio></div>}

      {datos?.porMoneda.map((m) => {
        const todas = filas(m, abiertos, [m.moneda]);
        const totalPaginas = Math.max(1, Math.ceil(todas.length / size));
        const actual = Math.min(page, totalPaginas);
        const visibles = todas.slice((actual - 1) * size, actual * size);
        return (
          <div key={m.moneda} className={`table-card tes-piv${cargando ? " cargando" : ""}`}>
            <div className="tes-piv-cab">
              <strong>{VISTAS.find((v) => v[0] === vista)[1]} · {datos.anio}</strong>
              <span>Suma de valor en {m.moneda} (ISO 4217) · {datos.niveles.join(" → ")} · {datos.pagos.toLocaleString("es-CO")} pago(s)</span>
            </div>
            <div className="table-scroll">
              <table className="tes-piv-tabla">
                <thead>
                  <tr>
                    <th className="tes-piv-etq">Etiquetas de fila</th>
                    {MESES.map((x) => <th key={x}>{x}</th>)}
                    <th className="tes-piv-total">Total general</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((r) => (
                    <tr key={r.clave} className={`n${Math.min(r.nivel, 3)}${r.tieneHijos ? " grupo" : ""}`}>
                      <th scope="row" className="tes-piv-etq" style={{ paddingLeft: 12 + r.nivel * 18 }}>
                        {r.tieneHijos ? (
                          <button type="button" className={`tes-piv-caret${r.abierto ? " abierto" : ""}`} onClick={() => alternar(r.clave)} aria-expanded={r.abierto} aria-label={`${r.abierto ? "Contraer" : "Expandir"} ${r.nombre}`}>
                            <IconChevronDown size={12} />
                          </button>
                        ) : <span className="tes-piv-hoja" aria-hidden="true" />}
                        <span className="tes-piv-nombre" title={r.nombre}>{r.nombre}</span>
                      </th>
                      {r.meses.map((v, i) => <CeldaValor key={i} v={v} onAbrir={() => setCelda({ moneda: m.moneda, ruta: r.ruta, mes: i, titulo: `${r.ruta.join(" › ")} · ${MESES_LARGOS[i]} ${datos.anio}` })} />)}
                      <CeldaValor v={r.total} total onAbrir={() => setCelda({ moneda: m.moneda, ruta: r.ruta, mes: null, titulo: `${r.ruta.join(" › ")} · Total ${datos.anio}` })} />
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row" className="tes-piv-etq">Total general</th>
                    {m.meses.map((v, i) => <CeldaValor key={i} v={v} onAbrir={() => setCelda({ moneda: m.moneda, ruta: [], mes: i, titulo: `Total general · ${MESES_LARGOS[i]} ${datos.anio}` })} />)}
                    <CeldaValor v={m.total} total onAbrir={() => setCelda({ moneda: m.moneda, ruta: [], mes: null, titulo: `Total general · ${datos.anio}` })} />
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="table-footer">
              <div className="field" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <label htmlFor={`tp-size-${m.moneda}`} style={{ marginBottom: 0 }}>Tamaño</label>
                <select id={`tp-size-${m.moneda}`} value={size} onChange={(e) => setSize(Number(e.target.value))}>{PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}</select>
              </div>
              <div className="page-btns">
                <button type="button" className="btn small" disabled={actual <= 1} onClick={() => setPage(actual - 1)}>Anterior</button>
                <button type="button" className="btn small" disabled={actual >= totalPaginas} onClick={() => setPage(actual + 1)}>Siguiente</button>
              </div>
              <span className="count-note">Página {actual} de {totalPaginas}</span>
              <div className="spacer" />
              <span className="count-note">{todas.length} fila(s) visibles</span>
            </div>
          </div>
        );
      })}
      {celda && <DetalleCelda celda={celda} consulta={consultaDe(f, vista)} acceso={acceso} onClose={() => setCelda(null)} />}
    </div>
  );
}

// Una cifra de la tabla: se puede tocar (clic o Enter) para ver los movimientos que la forman.
function CeldaValor({ v, total = false, onAbrir }) {
  const cls = `${total ? "tes-piv-total " : ""}${v < 0 ? "neg " : ""}${v ? "clic" : ""}`.trim();
  if (!v) return <td className={cls} />;
  return (
    <td className={cls} onClick={onAbrir} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onAbrir(); } }} tabIndex={0} title="Ver los pagos de esta cifra">
      {fmt(v)}
    </td>
  );
}

const PAGE_SIZES_MODAL = [10, 25, 50, 100];

// Pagos de una celda (como el doble clic de Excel en una tabla dinámica). Cada uno abre su detalle.
function DetalleCelda({ celda, consulta, acceso, onClose }) {
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(PAGE_SIZES_MODAL[0]);
  const [d, setD] = useState(null);
  const [error, setError] = useState("");
  const [abierto, setAbierto] = useState(null);
  const [cat, setCat] = useState(null);

  const cargar = useCallback(async () => {
    const q = new URLSearchParams(consulta);
    q.set("moneda", celda.moneda); q.set("ruta", JSON.stringify(celda.ruta)); q.set("page", page); q.set("size", size);
    if (celda.mes != null) q.set("mes", celda.mes);
    try {
      const r = await fetch(`/api/tesoreria/reportes/detalle?${q}`, { cache: "no-store" });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error || `Error ${r.status}`);
      setD(b); setError("");
      if (b.page !== page) setPage(b.page);
    } catch (e) { setError(e.message); }
  }, [celda, consulta, page, size]);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { setPage(1); }, [size]);
  useEffect(() => { fetch("/api/tesoreria/maestros", { cache: "no-store" }).then((r) => r.json()).then(setCat).catch(() => {}); }, []);
  useEffect(() => { const k = (e) => { if (e.key === "Escape" && !abierto) onClose(); }; document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k); }, [abierto, onClose]);

  return (
    <Portal>
      <div className="modal-overlay tes-tema" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="modal tes-celda-modal" role="dialog" aria-modal="true" aria-label={celda.titulo} style={{ maxWidth: 1000, width: "100%" }}>
          <div className="modal-head">
            <div style={{ minWidth: 0 }}>
              <h3 style={{ margin: 0 }}>{celda.titulo}</h3>
              {d && <span className="card-sub">{d.cantidad.toLocaleString("es-CO")} pago(s) · suman <strong className={d.total < 0 ? "tes-neg" : "tes-pos"}>{d.totalTexto}</strong></span>}
            </div>
            <button type="button" className="btn-ghost icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
          </div>
          <div className="tes-celda-cuerpo">
            {error && <p className="modal-error">{error}</p>}
            <div className="table-scroll">
              <table className="records tes-tabla">
                <thead><tr><th>Vence</th><th>Tipo</th><th>Ítem</th><th>Concepto</th><th>Medio de pago</th><th>Paga</th><th style={{ textAlign: "right" }}>Valor</th><th>Movimientos</th><th>Estado</th></tr></thead>
                <tbody>
                  {!d && !error && Array.from({ length: 5 }).map((_, i) => <tr key={i} aria-hidden="true"><td colSpan={9}><div className="skeleton-bar" style={{ height: 18, borderRadius: 6 }} /></td></tr>)}
                  {d?.items.map((x) => (
                    <tr key={x.id} className="clickable" onClick={() => setAbierto(x.id)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setAbierto(x.id)}>
                      <td>{fechaCorta(x.fecha)}{x.fechaAproximada ? " *" : ""}</td>
                      <td><TipoPago tipo={x.tipo} /></td>
                      <td><Celda v={x.item} /></td>
                      <td><Celda v={x.concepto} ancha /></td>
                      <td>{x.medioPago || <span className="muted">—</span>}</td>
                      <td>{x.pagador || <span className="muted">—</span>}</td>
                      <td style={{ textAlign: "right" }}><Dinero valor={x.valor} texto={x.valorTexto} fuerte /></td>
                      <td>{x.movimientos ? `${x.movimientos} mov.` : <span className="muted">—</span>}</td>
                      <td><EstadoPago estado={x.estado} /></td>
                    </tr>
                  ))}
                  {d && !d.items.length && <tr><td colSpan={9}><div className="empty compacta">No hay pagos en esta cifra.</div></td></tr>}
                </tbody>
              </table>
            </div>
            {d && <Paginacion id="tes-celda-pagesize" page={d.page} size={size} total={d.cantidad} sizes={PAGE_SIZES_MODAL} onPage={setPage} onSize={setSize} etiqueta="pago(s)" />}
          </div>
        </div>
      </div>
      {abierto && cat && <DetallePagoModal id={abierto} cat={cat} puedeRegistrar={!!acceso?.puedeRegistrar} onClose={() => setAbierto(null)} onCambio={() => cargar()} />}
    </Portal>
  );
}
