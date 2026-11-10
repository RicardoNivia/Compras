"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { tesMovimientos } from "@/lib/tesoreriaApi";
import { fmtMoneda } from "@/lib/moneda";
import { crossfade } from "@/lib/crossfade";
import { Paginacion } from "@/components/notificaciones/ui";
import { Celda, EstadoPill, tipoTexto, fechaCorta, useCatalogos, Aviso, MESES, anios, anioActual } from "@/components/tesoreria/comun";
import { FormMovimientoModal, SoporteModal, DetalleMovimientoModal } from "@/components/tesoreria/MovimientoModales";

const PAGE_SIZES = [25, 50, 100];
const ESTADOS = [["", "Todos"], ["proyectado", "Proyectados"], ["ejecutado", "Ejecutados"], ["conciliado", "Conciliados"], ["porConciliar", "Por conciliar"], ["sinSoporte", "Sin soporte"]];

export default function MovimientosTesoreria({ acceso }) {
  const params = useSearchParams();
  const { cat, error: errorCat } = useCatalogos();
  const [f, setF] = useState({ q: "", anio: anioActual(), mes: "", cuentaId: "", itemId: "", tipo: "", estado: params.get("estado") || "" });
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(PAGE_SIZES[0]);
  const [data, setData] = useState({ items: [], total: 0, totales: [] });
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(params.get("nuevo") === "soporte" ? { tipo: "soporte" } : null);
  const [aviso, setAviso] = useState("");
  const puedeRegistrar = !!acceso?.puedeRegistrar;

  // Búsqueda con pausa (no consulta en cada tecla).
  useEffect(() => { const t = setTimeout(() => setF((x) => (x.q === q ? x : { ...x, q })), 350); return () => clearTimeout(t); }, [q]);
  useEffect(() => { setPage(1); }, [f, size]);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await tesMovimientos({ ...f, page, size });
      setData(r);
      if (r.page !== page) setPage(r.page);
      setError("");
    } catch (e) { setError(e.message); } finally { setCargando(false); }
  }, [f, page, size]);
  useEffect(() => { cargar(); }, [cargar]);

  const cambio = (msg) => { if (msg) setAviso(msg); cargar(); };
  const guardado = (_mov, msg) => { setModal(null); cambio(msg); };
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  return (
    <div className="tes-vista">
      <div className="card tes-filtros">
        <div className="field" style={{ flex: "2 1 220px" }}>
          <label htmlFor="tf-q">Buscar</label>
          <input id="tf-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Concepto, tercero o referencia" />
        </div>
        <div className="field" style={{ width: 100 }}>
          <label htmlFor="tf-anio">Año</label>
          <select id="tf-anio" value={f.anio} onChange={set("anio")}>{anios().map((a) => <option key={a}>{a}</option>)}</select>
        </div>
        <div className="field" style={{ width: 130 }}>
          <label htmlFor="tf-mes">Mes</label>
          <select id="tf-mes" value={f.mes} onChange={set("mes")}><option value="">Todos</option>{MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
        </div>
        <div className="field" style={{ width: 150 }}>
          <label htmlFor="tf-cuenta">Cuenta</label>
          <select id="tf-cuenta" value={f.cuentaId} onChange={set("cuentaId")}><option value="">Todas</option>{cat?.cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select>
        </div>
        <div className="field" style={{ width: 150 }}>
          <label htmlFor="tf-item">Ítem</label>
          <select id="tf-item" value={f.itemId} onChange={set("itemId")}><option value="">Todos</option>{cat?.items.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select>
        </div>
        <div className="field" style={{ width: 130 }}>
          <label htmlFor="tf-tipo">Tipo</label>
          <select id="tf-tipo" value={f.tipo} onChange={set("tipo")}><option value="">Todos</option><option value="ingreso">Ingresos</option><option value="egreso">Egresos</option><option value="traslado">Traslados</option></select>
        </div>
        {puedeRegistrar && (
          <div className="tes-filtros-acciones">
            <button type="button" className="btn" onClick={() => setModal({ tipo: "form" })} disabled={!cat}>Registrar a mano</button>
            <button type="button" className="btn btn-primary" onClick={() => setModal({ tipo: "soporte" })} disabled={!cat}>Registrar con soporte</button>
          </div>
        )}
      </div>

      <div className="dash-tabs" role="tablist" aria-label="Estado" style={{ alignSelf: "flex-start", flexWrap: "wrap" }}>
        {ESTADOS.map(([k, t]) => <button key={k || "todos"} type="button" role="tab" className="dash-tab" aria-selected={f.estado === k} onClick={() => crossfade(() => setF((x) => ({ ...x, estado: k })))}>{t}</button>)}
      </div>

      {(error || errorCat) && <p className="modal-error">{error || errorCat}</p>}

      {data.totales.length > 0 && (
        <div className="tes-totales">
          {data.totales.map((t) => (
            <span key={t.moneda}>Filtro en {t.moneda}: entra <strong className="tes-pos">{fmtMoneda(t.ingresos, t.moneda)}</strong> · sale <strong className="tes-neg">{fmtMoneda(t.egresos, t.moneda)}</strong> · neto <strong>{fmtMoneda(t.ingresos - t.egresos, t.moneda)}</strong>{t.traslados ? <> · traslados {fmtMoneda(t.traslados, t.moneda)}</> : null}</span>
          ))}
        </div>
      )}

      <div className={`table-card${cargando && data.items.length ? " tes-recargando" : ""}`}>
        <div className="table-scroll">
          <table className="records tes-tabla">
            <thead>
              <tr><th>Fecha</th><th>Tipo</th><th>Ítem</th><th>Concepto</th><th>Cuenta</th><th>Paga</th><th>Tercero</th><th style={{ textAlign: "right" }}>Valor</th><th>Estado</th><th>Soporte</th></tr>
            </thead>
            <tbody>
              {cargando && !data.items.length && Array.from({ length: 8 }).map((_, i) => (
                <tr key={`esq-${i}`} aria-hidden="true">{Array.from({ length: 10 }).map((__, j) => <td key={j}><div className="skeleton-bar" style={{ height: 12, borderRadius: 6, width: j === 3 ? 180 : 70 }} /></td>)}</tr>
              ))}
              {!cargando && !data.items.length && <tr><td colSpan={10} className="muted" style={{ textAlign: "center", padding: 22 }}>No hay movimientos con estos filtros.</td></tr>}
              {data.items.map((m) => (
                <tr key={m.id} className="clickable" onClick={() => setModal({ tipo: "detalle", id: m.id })}>
                  <td title={m.fechaAproximada ? "El Excel solo traía el mes" : undefined}>{fechaCorta(m.fecha)}{m.fechaAproximada ? " *" : ""}</td>
                  <td>{tipoTexto(m.tipo)}</td>
                  <td><Celda v={m.item} /></td>
                  <td><Celda v={m.concepto} ancha /></td>
                  <td><Celda v={m.cuentaDestino ? `${m.cuenta} → ${m.cuentaDestino}` : m.cuenta} /></td>
                  <td>{m.pagador || <span className="muted">—</span>}</td>
                  <td><Celda v={m.tercero} /></td>
                  <td style={{ textAlign: "right" }} className={m.tipo === "egreso" ? "tes-neg" : m.tipo === "ingreso" ? "tes-pos" : ""}><strong>{m.tipo === "egreso" ? "−" : m.tipo === "ingreso" ? "+" : "⇄ "}{m.valorTexto}</strong></td>
                  <td><EstadoPill mov={m} /></td>
                  <td>{m.soportes ? `${m.soportes} archivo(s)` : <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Paginacion id="tes-mov-pagesize" page={page} size={size} total={data.total} sizes={PAGE_SIZES} onPage={setPage} onSize={setSize} etiqueta="movimiento(s)" />
      </div>
      <p className="muted" style={{ fontSize: 12, margin: 0 }}>* Fecha aproximada: el movimiento vino del Excel, que solo tenía el mes. Al conciliarlo toma la fecha real del banco.</p>

      {modal?.tipo === "form" && cat && <FormMovimientoModal cat={cat} movimiento={modal.mov} onClose={() => setModal(null)} onSaved={guardado} />}
      {modal?.tipo === "soporte" && cat && <SoporteModal cat={cat} onClose={() => setModal(null)} onSaved={guardado} />}
      {modal?.tipo === "detalle" && cat && <DetalleMovimientoModal id={modal.id} cat={cat} puedeRegistrar={puedeRegistrar} onClose={() => setModal(null)} onCambio={cambio} onEditar={(mov) => setModal({ tipo: "form", mov })} />}
      <Aviso texto={aviso} onCerrar={() => setAviso("")} />
    </div>
  );
}
