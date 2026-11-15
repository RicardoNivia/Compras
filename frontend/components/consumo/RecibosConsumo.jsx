"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { conRecibos, conRecibo } from "@/lib/consumoApi";
import { fmtMoneda } from "@/lib/moneda";
import { crossfade } from "@/lib/crossfade";
import BotonExcel from "@/components/BotonExcel";
import EstadoVacio from "@/components/EstadoVacio";
import { IconSearch, IconPlus, IconFile } from "@/components/icons";
import { SERVICIOS, ORDEN_SERVICIOS, TIPOS_LECTURA, ESTADOS_PAGO, PuntoServicio, EtiquetaServicio, useCatalogosConsumo, Aviso, PildoraPago, PildoraLectura, fmtNum, fmtConsumo, fmtVar, claseVar } from "@/components/consumo/comun";
import { FormReciboModal, DetalleReciboModal } from "@/components/consumo/ReciboModales";

// Recibos: la «Base de datos» del Excel del contador. Una fila por recibo (cuenta + período), con lo que vino en el
// recibo y lo que se calcula solo (por día, variación frente al período anterior). Paginación y filtros en el servidor.
const PAGE_SIZES = [25, 50, 100];
const Texto = ({ v }) => (v ? <span className="desc-tooltip-wrap"><span className="desc-text">{v}</span><span className="desc-tooltip-bubble">{v}</span></span> : <span className="muted">—</span>);

export default function RecibosConsumo({ acceso }) {
  const { cat, recargar: recargarCat } = useCatalogosConsumo();
  const [f, setF] = useState({ q: "", sedeId: "", servicio: "", anio: "", pago: "", lectura: "" });
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(PAGE_SIZES[0]);
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [form, setForm] = useState(null); // { recibo | null }
  const [detalleId, setDetalleId] = useState(null);
  const pedido = useRef(0);
  const puede = !!acceso?.puedeRegistrar;

  // La búsqueda espera a que la persona deje de escribir.
  useEffect(() => { const t = setTimeout(() => setF((x) => (x.q === q ? x : { ...x, q })), 300); return () => clearTimeout(t); }, [q]);
  useEffect(() => { setPage(1); }, [f, size]);

  const cargar = useCallback(() => {
    const n = ++pedido.current;
    return conRecibos({ ...f, page, size }).then((r) => { if (n === pedido.current) { setDatos(r); setError(""); if (r.page !== page) setPage(r.page); } }).catch((e) => { if (n === pedido.current) setError(e.message); });
  }, [f, page, size]);
  useEffect(() => { cargar(); }, [cargar]);

  const cambiar = (campo) => (e) => setF((x) => ({ ...x, [campo]: e.target.value }));
  const refrescar = (mensaje) => { if (mensaje) setAviso(mensaje); cargar(); recargarCat(); };
  const paginas = datos ? Math.max(1, Math.ceil(datos.total / datos.size)) : 1;
  const t = datos?.totales;

  return (
    <div className="con-recibos">
      <div className="con-tabs" role="tablist" aria-label="Servicio">
        <button type="button" role="tab" aria-selected={!f.servicio} className={`con-tab${!f.servicio ? " activa" : ""}`} onClick={() => crossfade(() => setF((x) => ({ ...x, servicio: "" })))}>Todos <span className="con-tab-n">{datos?.todosLosServicios ?? "…"}</span></button>
        {ORDEN_SERVICIOS.map((s) => (
          <button key={s} type="button" role="tab" aria-selected={f.servicio === s} className={`con-tab${f.servicio === s ? " activa" : ""}`} onClick={() => crossfade(() => setF((x) => ({ ...x, servicio: s })))}>
            <PuntoServicio servicio={s} />{SERVICIOS[s].corto} <span className="con-tab-n">{datos?.porServicio?.[s] ?? "…"}</span>
          </button>
        ))}
        <div className="spacer" />
        {puede && <button type="button" className="btn" onClick={() => setForm({ recibo: null })} disabled={!cat}><IconPlus size={13} /> Registrar a mano</button>}
        {puede && <a className="btn btn-primary" href="/consumo/subir">Subir recibos con Nova</a>}
      </div>

      <div className="table-card">
        <div className="con-filtros">
          <div className="field con-filtro-buscar"><label htmlFor="rc-q">Buscar</label>
            <div className="maestros-search-wrap"><input id="rc-q" type="search" placeholder="Sede, cuenta, medidor o número de factura" value={q} onChange={(e) => setQ(e.target.value)} /><span className="ic"><IconSearch size={14} /></span></div>
          </div>
          <div className="field"><label htmlFor="rc-sede">Sede</label><select id="rc-sede" value={f.sedeId} onChange={cambiar("sedeId")}><option value="">Todas las sedes</option>{(cat?.sedes || []).map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select></div>
          <div className="field"><label htmlFor="rc-anio">Año</label><select id="rc-anio" value={f.anio} onChange={cambiar("anio")}><option value="">Todos</option>{(datos?.anios || []).map((a) => <option key={a} value={a}>{a}</option>)}</select></div>
          <div className="field"><label htmlFor="rc-pago">Pago</label><select id="rc-pago" value={f.pago} onChange={cambiar("pago")}><option value="">Todos</option><option value="pendiente">Por pagar</option><option value="vencido">Vencidos</option><option value="pagado">Pagados</option><option value="saldo_favor">Saldo a favor</option></select></div>
          <div className="field"><label htmlFor="rc-lec">Lectura</label><select id="rc-lec" value={f.lectura} onChange={cambiar("lectura")}><option value="">Todas</option><option value="real">Real</option><option value="no_real">Promediada o estimada</option><option value="sin_consumo">Sin consumo</option></select></div>
        </div>

        {t && datos.total > 0 && (
          <div className="con-totales">
            <div><span>Total cargos del filtro</span><strong>{fmtMoneda(t.totalCargos)}</strong></div>
            <div><span>Pagado</span><strong>{fmtMoneda(t.pagado)}</strong></div>
            <div><span>Saldo por pagar</span><strong>{fmtMoneda(t.saldo)}</strong>{t.vencidos > 0 && <small className="con-sube">{t.vencidos} vencido(s)</small>}</div>
            {Object.entries(t.consumos).map(([s, c]) => <div key={s}><span>{SERVICIOS[s].corto}</span><strong>{fmtConsumo(c, SERVICIOS[s].unidad)}</strong></div>)}
          </div>
        )}
        {error && <div className="modal-error" style={{ margin: 12 }}>{error}</div>}

        <div className="table-scroll">
          <table className="records con-tabla">
            <thead>
              <tr>
                <th>Período facturado</th><th>Sede</th><th>Servicio · cuenta</th><th>Factura</th><th className="num">Días</th><th>Lectura</th>
                <th className="num">Consumo</th><th className="num">Por día</th><th className="num">Valor unitario</th><th className="num">Total cargos</th><th className="num">Var. %</th><th>Pago</th><th>Origen</th>
              </tr>
            </thead>
            <tbody>
              {!datos && Array.from({ length: 6 }).map((_, i) => <tr key={i} aria-hidden="true"><td colSpan={13}><div className="skeleton-bar" style={{ height: 20, borderRadius: 8 }} /></td></tr>)}
              {datos && datos.items.length === 0 && (
                <tr><td colSpan={13}>
                  <EstadoVacio titulo={datos.todosLosServicios === 0 && !Object.values(f).some(Boolean) ? "Todavía no hay recibos" : "Ningún recibo con ese filtro"} icono={<IconFile size={22} />}
                    accion={puede && datos.todosLosServicios === 0 ? <button type="button" className="btn btn-primary" onClick={() => setForm({ recibo: null })}>Registrar el primero</button> : null}>
                    {datos.todosLosServicios === 0 ? "Registra un recibo a mano con su soporte. La subida con Nova llega en la siguiente fase." : "Cambia la búsqueda o los filtros."}
                  </EstadoVacio>
                </td></tr>
              )}
              {datos?.items.map((r) => (
                <tr key={r.id} className="con-fila" tabIndex={0} onClick={() => setDetalleId(r.id)} onKeyDown={(e) => { if (e.key === "Enter") setDetalleId(r.id); }}>
                  <td><strong>{r.mesTexto}</strong> <span className="muted">· {r.periodo}</span></td>
                  <td className="con-col-sede"><Texto v={r.sede} /></td>
                  <td><EtiquetaServicio servicio={r.servicio} corto /> <span className="con-mono muted">{r.numeroCuenta}</span></td>
                  <td className="con-mono">{r.numeroFactura || <span className="muted">—</span>}</td>
                  <td className="num con-mono">{r.dias ?? "—"}</td>
                  <td><PildoraLectura tipo={r.tipoLectura} /></td>
                  <td className="num con-mono"><strong>{fmtConsumo(r.consumo, r.unidad)}</strong></td>
                  <td className="num con-mono">{r.consumoDia != null ? fmtNum(r.consumoDia, 1) : "—"}</td>
                  <td className="num con-mono">{r.valorUnitario != null ? `${r.moneda} ${fmtNum(r.valorUnitario, 2)}` : "—"}</td>
                  <td className="num con-mono"><strong>{fmtMoneda(r.totalCargos, r.moneda)}</strong></td>
                  <td className={`num con-mono ${claseVar(r.varTotal)}`}>{fmtVar(r.varTotal)}</td>
                  <td><PildoraPago recibo={r} /></td>
                  <td className="muted">{r.origen === "nova" ? "Nova" : "A mano"}{r.soportes ? " · con soporte" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="table-footer">
          <div className="field" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <label htmlFor="rc-size" style={{ marginBottom: 0 }}>Tamaño</label>
            <select id="rc-size" value={size} onChange={(e) => setSize(Number(e.target.value))}>{PAGE_SIZES.map((x) => <option key={x} value={x}>{x}</option>)}</select>
          </div>
          <div className="page-btns">
            <button type="button" className="btn small" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</button>
            <button type="button" className="btn small" disabled={page >= paginas} onClick={() => setPage(page + 1)}>Siguiente</button>
          </div>
          <span className="count-note">Página {datos?.page ?? 1} de {paginas}</span>
          <div className="spacer" />
          <BotonExcel nombre="consumo-recibos" hoja="Recibos" deshabilitado={!datos?.total}
            obtener={async () => { const out = []; for (let p = 1; ; p++) { const r = await conRecibos({ ...f, page: p, size: 200 }); out.push(...r.items); if (out.length >= r.total || !r.items.length) break; } return out; }}
            columnas={[
              { t: "Mes de reporte", v: (r) => r.mesTexto }, { t: "Sede", v: (r) => r.sede }, { t: "Servicio", v: (r) => SERVICIOS[r.servicio]?.nombre }, { t: "Empresa", v: (r) => r.empresa },
              { t: "Cuenta", v: (r) => r.numeroCuenta }, { t: "Medidor", v: (r) => r.medidor }, { t: "N° factura", v: (r) => r.numeroFactura }, { t: "Desde", v: (r) => r.periodoDesde }, { t: "Hasta", v: (r) => r.periodoHasta },
              { t: "Días fact.", v: (r) => r.dias }, { t: "Tipo de lectura", v: (r) => TIPOS_LECTURA[r.tipoLectura] }, { t: "Lectura anterior", v: (r) => r.lecturaAnterior }, { t: "Lectura actual", v: (r) => r.lecturaActual }, { t: "Factor", v: (r) => r.factor },
              { t: "Consumo", v: (r) => r.consumo }, { t: "Unidad", v: (r) => r.unidad }, { t: "Vigencia tarifa", v: (r) => r.vigenciaTarifa }, { t: "Valor unitario", v: (r) => r.valorUnitario },
              { t: "Total cargos del período", v: (r) => r.totalCargos }, { t: "Aseo incluido", v: (r) => r.valorAseo }, { t: "Saldo anterior", v: (r) => r.saldoAnterior }, { t: "Total a pagar", v: (r) => r.totalPagar }, { t: "Moneda", v: (r) => r.moneda },
              { t: "Valor pagado", v: (r) => r.valorPagado }, { t: "Fecha de pago", v: (r) => r.fechaPago }, { t: "Estado del pago", v: (r) => (r.vencido ? "Vencido" : ESTADOS_PAGO[r.estadoPago]) }, { t: "Pago oportuno", v: (r) => r.fechaPagoOportuno }, { t: "Suspensión", v: (r) => r.fechaSuspension },
              { t: "Var. % consumo", v: (r) => r.varConsumo }, { t: "Var. % valor unitario", v: (r) => r.varUnitario }, { t: "Var. % total cargos", v: (r) => r.varTotal }, { t: "Consumo / día", v: (r) => r.consumoDia }, { t: "Costo / día", v: (r) => r.costoDia }, { t: "Costo efectivo por unidad", v: (r) => r.costoUnidad },
              { t: "Origen", v: (r) => (r.origen === "nova" ? "Nova" : "A mano") }, { t: "Nota", v: (r) => r.nota }, { t: "Creado por", v: (r) => r.creadoPorNombre },
            ]} />
          <span className="count-note">{(datos?.total ?? 0).toLocaleString("es-CO")} recibo(s)</span>
        </div>
      </div>

      {detalleId && <DetalleReciboModal id={detalleId} acceso={acceso} onClose={() => setDetalleId(null)} onCambio={refrescar} onEditar={(r) => { setDetalleId(null); setForm({ recibo: r }); }} />}
      {form && cat && <FormReciboModal cat={cat} recibo={form.recibo} onClose={() => setForm(null)} onSaved={async (m, r) => { setForm(null); refrescar(m); if (r?.id) { await conRecibo(r.id).catch(() => null); setDetalleId(r.id); } }} />}
      <Aviso texto={aviso} onCerrar={() => setAviso("")} />
    </div>
  );
}
