"use client";

import EstadoVacio from "@/components/EstadoVacio";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { tesMovimientos } from "@/lib/tesoreriaApi";
import { fmtMoneda } from "@/lib/moneda";
import { crossfade } from "@/lib/crossfade";
import { Paginacion } from "@/components/notificaciones/ui";
import { BotonExcel, todasLasPaginas, Celda, fechaCorta, useCatalogos, Aviso, MESES, anioActual, useAniosTesoreria } from "@/components/tesoreria/comun";
import { FormMovimientoModal, DetalleMovimientoModal, ExtractoModal, SoportesLoteModal } from "@/components/tesoreria/MovimientoModales";

const PAGE_SIZES = [25, 50, 100];
// Columnas del Excel (las de la tabla y los demás campos del formulario único).
const COLS_EXCEL = [
  { t: "Fecha", v: (m) => m.fecha }, { t: "Banco", v: (m) => m.banco }, { t: "Tipo", v: (m) => m.tipoTexto },
  { t: "Descripción del banco", v: (m) => m.descripcion }, { t: "Concepto", v: (m) => m.concepto }, { t: "Tercero", v: (m) => m.tercero },
  { t: "Valor (COP, − sale)", v: (m) => (m.tipo === "debito" ? -m.valor : m.valor) }, { t: "Pagos asociados", v: (m) => m.pagos },
  { t: "Sin asignar (COP)", v: (m) => m.sinAsignar }, { t: "Referencia", v: (m) => m.referencia }, { t: "Observación", v: (m) => m.observacion },
  { t: "Tipo de carga", v: (m) => m.tipoCarga }, { t: "Tipo de solicitud", v: (m) => m.tipoSolicitud }, { t: "Preparador", v: (m) => m.preparador },
  { t: "Formato", v: (m) => m.formato }, { t: "Soportes", v: (m) => m.soportes }, { t: "Origen", v: (m) => m.origen }, { t: "Registró", v: (m) => m.creadoPorNombre },
];
const TABS = [["", "Todos"], ["sin", "Sin asociar"], ["parcial", "Parcialmente"], ["con", "Asociados"]];

// Movimientos reales de los bancos (las pestañas «Mvto …» del Excel). Se registran a mano, subiendo el extracto o con
// la plantilla; cada uno se puede asociar a uno o varios pagos programados.
export default function MovimientosTesoreria({ acceso }) {
  const aniosMov = useAniosTesoreria("movimientos"); // los años que tienen movimientos del banco
  const params = useSearchParams();
  const { cat, error: errorCat } = useCatalogos();
  const [f, setF] = useState({ q: "", anio: params.get("id") ? "" : anioActual(), mes: "", bancoId: "", tipo: "", asociacion: params.get("asociacion") || "", ids: params.get("id") || "" });
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(PAGE_SIZES[0]);
  const [data, setData] = useState({ items: [], total: 0, totales: { creditos: 0, debitos: 0, sinAsociar: 0 } });
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(params.get("id") ? { tipo: "detalle", id: Number(params.get("id")) } : params.get("nuevo") ? { tipo: "form", conSoporte: params.get("nuevo") === "soporte" } : null);
  const [aviso, setAviso] = useState("");
  const puedeRegistrar = !!acceso?.puedeRegistrar;

  useEffect(() => { const t = setTimeout(() => setF((x) => (x.q === q ? x : { ...x, q, ids: "" })), 350); return () => clearTimeout(t); }, [q]);
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
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value, ids: "" }));

  return (
    <div className="tes-vista">
      <div className="card tes-filtros">
        <div className="field" style={{ flex: "2 1 220px" }}>
          <label htmlFor="mf-q">Buscar</label>
          <input id="mf-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Descripción, concepto, tercero o valor" />
        </div>
        <div className="field" style={{ width: 150 }}>
          <label htmlFor="mf-banco">Banco</label>
          <select id="mf-banco" value={f.bancoId} onChange={set("bancoId")}><option value="">Todos</option>{cat?.bancos.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}</select>
        </div>
        <div className="field" style={{ width: 100 }}>
          <label htmlFor="mf-anio">Año</label>
          <select id="mf-anio" value={f.anio} onChange={set("anio")}><option value="">Todos</option>{[...new Set([...(aniosMov || []), anioActual()])].filter((a) => a <= anioActual() + 1).sort((x, y) => x - y).map((a) => <option key={a}>{a}</option>)}</select>
        </div>
        <div className="field" style={{ width: 130 }}>
          <label htmlFor="mf-mes">Mes</label>
          <select id="mf-mes" value={f.mes} onChange={set("mes")}><option value="">Todos</option>{MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
        </div>
        <div className="field" style={{ width: 150 }}>
          <label htmlFor="mf-tipo">Tipo</label>
          <select id="mf-tipo" value={f.tipo} onChange={set("tipo")}><option value="">Débitos y créditos</option><option value="debito">Débitos (sale)</option><option value="credito">Créditos (entra)</option></select>
        </div>
        {puedeRegistrar && (
          <div className="tes-filtros-acciones">
            <button type="button" className="btn" onClick={() => setModal({ tipo: "extracto" })} disabled={!cat?.bancos.length}>Subir extracto o movimientos</button>
            <button type="button" className="btn" onClick={() => setModal({ tipo: "form", conSoporte: true })} disabled={!cat?.bancos.length}>Registrar con soporte</button>
            <button type="button" className="btn" onClick={() => setModal({ tipo: "lote" })}>Subir varios soportes</button>
            <button type="button" className="btn btn-primary" onClick={() => setModal({ tipo: "form" })} disabled={!cat?.bancos.length}>+ Registrar movimiento</button>
          </div>
        )}
      </div>
      {cat && !cat.bancos.length && <div className="tes-ayuda"><div>Todavía no hay bancos. Créalos en <a href="/tesoreria/maestros">Maestros</a> o sube la plantilla en <a href="/tesoreria/importar">Importar plantilla</a>.</div></div>}

      <div className="tes-cabecera">
        <div className="dash-tabs" role="tablist" aria-label="Asociación">
          {TABS.map(([k, t]) => <button key={k || "todos"} type="button" role="tab" className="dash-tab" aria-selected={f.asociacion === k} onClick={() => crossfade(() => setF((x) => ({ ...x, asociacion: k, ids: "" })))}>{t}</button>)}
        </div>
        <div className="spacer" />
        <span className="tes-totales">Con este filtro: entra <strong className="tes-num tes-pos">{fmtMoneda(data.totales.creditos, "COP")}</strong> · sale <strong className="tes-num tes-neg">{fmtMoneda(data.totales.debitos, "COP")}</strong> · {data.totales.sinAsociar} sin asociar</span>
        <BotonExcel nombre="tesoreria-movimientos" hoja="Movimientos" columnas={COLS_EXCEL} obtener={() => todasLasPaginas(tesMovimientos, f)} deshabilitado={!data.total} />
      </div>
      {f.ids && <div className="tes-ayuda"><div>Mostrando solo el movimiento #{f.ids}.</div><button type="button" className="btn small" onClick={() => setF((x) => ({ ...x, ids: "", anio: anioActual(), mes: "" }))}>Ver todos</button></div>}

      {(error || errorCat) && <p className="modal-error">{error || errorCat}</p>}

      <div className={`table-card${cargando && data.items.length ? " tes-recargando" : ""}`}>
        <div className="table-scroll">
          <table className="records tes-tabla">
            <thead>
              <tr><th>Fecha</th><th>Banco</th><th>Tipo</th><th>Descripción del banco</th><th>Concepto</th><th>Tercero</th><th style={{ textAlign: "right" }}>Valor</th><th>Pagos</th><th>Soporte</th></tr>
            </thead>
            <tbody>
              {cargando && !data.items.length && Array.from({ length: 8 }).map((_, i) => (
                <tr key={`esq-${i}`} aria-hidden="true">{Array.from({ length: 9 }).map((__, j) => <td key={j}><div className="skeleton-bar" style={{ height: 12, borderRadius: 6, width: j === 3 ? 180 : 70 }} /></td>)}</tr>
              ))}
              {!cargando && !data.items.length && <tr><td colSpan={9}><EstadoVacio titulo="No hay movimientos aquí" accion={puedeRegistrar && cat?.bancos.length ? <button type="button" className="btn btn-primary" onClick={() => setModal({ tipo: "extracto" })}>Subir extracto o movimientos</button> : !cat?.bancos.length ? <a className="btn btn-primary" href="/tesoreria/importar">Importar la plantilla</a> : null}>Sube el extracto del banco, registra un movimiento o importa la plantilla de flujo de caja. Si filtraste, prueba con otro período.</EstadoVacio></td></tr>}
              {data.items.map((m) => (
                <tr key={m.id} className="clickable" onClick={() => setModal({ tipo: "detalle", id: m.id })}>
                  <td title={m.fechaAproximada ? "La fecha del Excel estaba dañada: solo se sabe el mes" : undefined}>{fechaCorta(m.fecha)}{m.fechaAproximada ? " *" : ""}</td>
                  <td>{m.banco}</td>
                  <td><span className={`pill ${m.tipo === "debito" ? "critical" : "good"}`}>{m.tipoTexto}</span></td>
                  <td><Celda v={m.descripcion} ancha /></td>
                  <td><Celda v={m.concepto} /></td>
                  <td><Celda v={m.tercero} /></td>
                  <td style={{ textAlign: "right" }}><span className={`tes-num ${m.tipo === "debito" ? "tes-neg" : "tes-pos"}`}><strong>{m.tipo === "debito" ? "−" : "+"}{m.valorTexto}</strong></span></td>
                  <td>{m.pagos === 0 ? <span className="pill warning">Sin asociar</span> : Math.abs(m.sinAsignar) > 0.5 ? <span className="pill secondary" title={`Faltan ${m.sinAsignarTexto} por asignar`}>{m.pagos} · parcial</span> : <span className="pill good">{m.pagos} pago(s)</span>}</td>
                  <td>{m.soportes ? `${m.soportes} archivo(s)` : <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Paginacion id="tes-mov-pagesize" page={page} size={size} total={data.total} sizes={PAGE_SIZES} onPage={setPage} onSize={setSize} etiqueta="movimiento(s)" />
      </div>
      <p className="muted" style={{ fontSize: 12, margin: 0 }}>* Fecha aproximada: en el Excel la fecha estaba dañada y se tomó el mes. Corrígela editando el movimiento.</p>

      {modal?.tipo === "form" && cat && <FormMovimientoModal cat={cat} movimiento={modal.mov} conSoporte={!!modal.conSoporte} onClose={() => setModal(null)} onSaved={(_m, msg, seguir) => { if (seguir) cargar(); else { setModal(null); cambio(msg); } }} />}
      {modal?.tipo === "detalle" && cat && <DetalleMovimientoModal id={modal.id} cat={cat} puedeRegistrar={puedeRegistrar} onClose={() => setModal(null)} onCambio={cambio} onEditar={(mov) => setModal({ tipo: "form", mov })} />}
      {modal?.tipo === "extracto" && cat && <ExtractoModal cat={cat} onClose={() => setModal(null)} onListo={(msg) => { setModal(null); cambio(msg); }} />}
      {modal?.tipo === "lote" && <SoportesLoteModal onClose={() => setModal(null)} onListo={(msg) => { setModal(null); cambio(msg); }} />}
      <Aviso texto={aviso} onCerrar={() => setAviso("")} />
    </div>
  );
}
