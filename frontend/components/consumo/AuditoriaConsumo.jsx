"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { conAuditoria } from "@/lib/consumoApi";
import { fmtMoneda } from "@/lib/moneda";
import { crossfade } from "@/lib/crossfade";
import EstadoVacio from "@/components/EstadoVacio";
import BotonExcel from "@/components/BotonExcel";
import { IconAlert } from "@/components/icons";
import { SERVICIOS, ORDEN_SERVICIOS, GRUPOS_CARGO, fmtNum, fmtVar, fechaCorta } from "@/components/consumo/comun";
import { DetalleReciboModal } from "@/components/consumo/ReciboModales";

// Auditoría y hallazgos = la hoja «Auditoría y Hallazgos» del Excel del contador, para UNA sede: A desglose de conceptos,
// B energía reactiva, C comparativo entre cuentas, D recibos sin factura detallada, E riesgo de doble facturación,
// F crédito de conexión y G hallazgos con prioridad y acción. Lo calcula backend/lib/consumo/analisis.js#auditoria.
const PRIORIDAD = { URGENTE: "critical", ALTA: "critical", MEDIA: "warning", BAJA: "muted", INFORMATIVO: "accent" };
const pct = (v) => (v == null ? "—" : `${fmtNum(v * 100, 1)} %`);

function Seccion({ letra, titulo, sub, children }) {
  return (
    <section className="card con-aud-sec">
      <div className="con-aud-head"><span className="con-aud-letra">{letra}</span><div><h3>{titulo}</h3>{sub && <p className="card-sub">{sub}</p>}</div></div>
      {children}
    </section>
  );
}

export default function AuditoriaConsumo({ acceso }) {
  const params = useSearchParams();
  const [f, setF] = useState({ sedeId: params.get("sedeId") || "", servicio: "energia", anio: "" });
  const [d, setD] = useState(null);
  const [error, setError] = useState("");
  const [detalleId, setDetalleId] = useState(null);
  useEffect(() => { conAuditoria(f).then((r) => { setD(r); setError(""); }).catch((e) => setError(e.message)); }, [f]);
  const cambiar = (campo) => (e) => crossfade(() => setF((x) => ({ ...x, [campo]: e.target.value, ...(campo !== "anio" ? { anio: "" } : {}) })));
  const u = d?.unidad;

  return (
    <div className="dashboard-shell con-dash">
      <div className="con-dash-barra">
        <div>
          <div className="con-dash-sobre">Auditoría y hallazgos{d?.sede ? ` · ${d.sede}` : ""}</div>
          <h2>{d && !d.vacio ? `${SERVICIOS[d.servicio].nombre}: ${d.periodo}` : "Auditoría por sede"}</h2>
          {d && !d.vacio && <p>{d.recibos} recibo(s) · {d.hallazgos.length} hallazgo(s)</p>}
        </div>
        <div className="con-dash-filtros">
          <div className="field"><label htmlFor="ca-sede">Sede</label><select id="ca-sede" value={f.sedeId || d?.sedeId || ""} onChange={cambiar("sedeId")}>{(d?.sedes || []).map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select></div>
          <div className="field"><label htmlFor="ca-serv">Servicio</label><select id="ca-serv" value={f.servicio} onChange={cambiar("servicio")}>{ORDEN_SERVICIOS.filter((s) => s !== "aseo").map((s) => <option key={s} value={s}>{SERVICIOS[s].nombre}</option>)}</select></div>
          <div className="field"><label htmlFor="ca-anio">Año</label><select id="ca-anio" value={f.anio} onChange={cambiar("anio")}><option value="">Todos</option>{(d?.anios || []).map((a) => <option key={a} value={a}>{a}</option>)}</select></div>
        </div>
      </div>
      {error && <div className="modal-error">{error}</div>}
      {!d && !error && <div className="skeleton-bar" style={{ height: 220, borderRadius: 16 }} aria-hidden="true" />}
      {d?.vacio && <div className="card"><EstadoVacio titulo="Sin recibos para auditar" icono={<IconAlert size={22} />} accion={<Link className="btn btn-primary" href="/consumo/subir">Subir recibos</Link>}>Esta sede no tiene recibos de {SERVICIOS[d.servicio].nombre.toLowerCase()} en el filtro.</EstadoVacio></div>}

      {d && !d.vacio && (
        <>
          <Seccion letra="G" titulo="Hallazgos y acciones recomendadas" sub="Calculados con los recibos de la sede, del más urgente al informativo. La referencia a la Ley 142 de 1994 es informativa; no es asesoría legal.">
            {d.hallazgos.length === 0 ? <EstadoVacio compacto titulo="Sin hallazgos">Los recibos de esta sede no muestran nada que revisar.</EstadoVacio> : (
              <div className="con-hallazgos">
                {d.hallazgos.map((h, i) => (
                  <div key={i} className={`con-hallazgo p-${h.prioridad.toLowerCase()}`}>
                    <span className={`pill ${PRIORIDAD[h.prioridad]}`}>{h.prioridad}</span>
                    <div><strong>{i + 1}. {h.titulo}</strong><p>{h.accion}</p></div>
                    {h.reciboId && <button type="button" className="btn small" onClick={() => setDetalleId(h.reciboId)}>Ver recibo</button>}
                  </div>
                ))}
              </div>
            )}
          </Seccion>

          <Seccion letra="A" titulo="Desglose de conceptos" sub={`Lo cobrado en los ${d.desglose.filas.length ? d.desglose.filas[0].de : 0} recibo(s) con detalle, por cuenta, con su peso en el total.`}>
            {d.desglose.filas.length === 0 ? <EstadoVacio compacto titulo="Sin detalle de cargos">Ningún recibo de la sede tiene los cargos detallados.</EstadoVacio> : (
              <div className="table-scroll" style={{ maxHeight: "none" }}>
                <table className="plain-table con-aud-tabla">
                  <thead><tr><th>Concepto</th><th>Grupo</th>{d.desglose.cuentas.map((c) => <th key={c.id} className="num">Cta {c.nombre}<small>{c.periodo}</small></th>)}<th className="num">Total</th><th className="num">% del total</th></tr></thead>
                  <tbody>
                    {d.desglose.filas.map((x) => (
                      <tr key={`${x.grupo}${x.concepto}`}>
                        <td><span className="desc-tooltip-wrap"><span className="desc-text">{x.concepto}</span><span className="desc-tooltip-bubble">{x.concepto} · en {x.recibos} de {x.de} recibo(s)</span></span></td>
                        <td className="muted">{GRUPOS_CARGO[x.grupo] || x.grupo}</td>
                        {d.desglose.cuentas.map((c) => <td key={c.id} className="num">{x.porCuenta[c.id] != null ? fmtMoneda(x.porCuenta[c.id]) : "—"}</td>)}
                        <td className="num"><strong>{fmtMoneda(x.total)}</strong></td><td className="num">{pct(x.pct)}</td>
                      </tr>
                    ))}
                    <tr className="total"><td>Total recibos con detalle</td><td />{d.desglose.cuentas.map((c) => <td key={c.id} className="num">{fmtMoneda(d.desglose.totalPorCuenta[c.id])}</td>)}<td className="num"><strong>{fmtMoneda(d.desglose.total)}</strong></td><td className="num">100 %</td></tr>
                  </tbody>
                </table>
              </div>
            )}
            {d.desglose.sinDetalle.length > 0 && <p className="card-sub" style={{ marginTop: 8 }}>No incluye {d.desglose.sinDetalle.length} recibo(s) sin detalle: {d.desglose.sinDetalle.map((s) => `${s.mes} (${fmtMoneda(s.total)})`).join(", ")}.</p>}
            {d.desglose.filas.length > 0 && <div style={{ marginTop: 10 }}><BotonExcel nombre={`consumo-desglose-${d.sede}`} hoja="Desglose" filas={d.desglose.filas} columnas={[{ t: "Concepto", v: (x) => x.concepto }, { t: "Grupo", v: (x) => GRUPOS_CARGO[x.grupo] }, ...d.desglose.cuentas.map((c) => ({ t: `Cta ${c.nombre}`, v: (x) => x.porCuenta[c.id] ?? null })), { t: "Total", v: (x) => x.total }, { t: "% del total", v: (x) => x.pct }]} /></div>}
          </Seccion>

          {d.servicio === "energia" && (
            <Seccion letra="B" titulo="Energía reactiva y factor de potencia" sub="Penalización si la reactiva supera el 50 % de la activa (CREG 015 de 2018).">
              {d.reactiva.length === 0 ? <EstadoVacio compacto titulo="Sin datos de energía reactiva">Los recibos de esta sede no traen la energía reactiva en los datos que leyó Nova.</EstadoVacio> : (
                <table className="plain-table con-aud-tabla">
                  <thead><tr><th>Período</th><th className="num">Activa ({u})</th><th className="num">Reactiva (kVArh)</th><th className="num">% reactiva / activa</th><th className="num">Factor de potencia</th><th>¿Cobro por reactiva?</th></tr></thead>
                  <tbody>{d.reactiva.map((x) => <tr key={x.mes}><td>{x.mes}</td><td className="num">{fmtNum(x.activa, 0)}</td><td className="num">{fmtNum(x.reactiva, 0)}</td><td className="num">{pct(x.pct)}</td><td className="num">{fmtNum(x.fp, 3)}</td><td>{x.cobro ? <span className="pill critical">Sí, supera 50 %</span> : <span className="pill good">No, dentro del límite</span>}</td></tr>)}</tbody>
                </table>
              )}
            </Seccion>
          )}

          <Seccion letra="C" titulo="Comparativo técnico y comercial entre cuentas" sub={d.comparativo.cuentas.length > 1 ? "Lo que cambió de una cuenta a otra y qué implica." : "La sede tiene una sola cuenta en el período: no hay con qué comparar."}>
            <div className="table-scroll" style={{ maxHeight: "none" }}>
              <table className="plain-table con-aud-tabla">
                <thead><tr><th>Atributo</th>{d.comparativo.cuentas.map((c) => <th key={c}>Cta {c}</th>)}<th>Implicación</th></tr></thead>
                <tbody>{d.comparativo.filas.map((x) => <tr key={x.titulo} className={x.cambia ? "cambia" : ""}><td>{x.titulo}</td>{x.valores.map((v, i) => <td key={i} className="con-mono">{v}</td>)}<td className="con-aud-impl">{x.implicacion || <span className="muted">Sin cambio</span>}</td></tr>)}</tbody>
              </table>
            </div>
          </Seccion>

          <Seccion letra="D" titulo="Recibos sin factura detallada" sub="Pagos globales o recibos de los que solo se tiene el total: su costo implícito frente al de los recibos con detalle.">
            {d.sinFactura.length === 0 ? <EstadoVacio compacto titulo="Todos los recibos tienen su detalle">No hay pagos globales ni recibos sin cargos.</EstadoVacio> : (
              <table className="plain-table con-aud-tabla">
                <thead><tr><th>Período</th><th>Factura</th><th className="num">Total</th><th className="num">Consumo</th><th className="num">COP/{u} implícito</th><th className="num">Referencia</th><th className="num">Diferencia</th><th /></tr></thead>
                <tbody>{d.sinFactura.map((x) => <tr key={x.id}><td>{x.mes}</td><td className="con-mono">{x.factura || "—"}</td><td className="num">{fmtMoneda(x.total)}</td><td className="num">{x.consumo != null ? `${fmtNum(x.consumo, 0)} ${u}` : "—"}</td><td className="num">{x.implicito != null ? fmtMoneda(x.implicito) : "—"}</td><td className="num">{x.referencia != null ? fmtMoneda(x.referencia) : "—"}</td><td className="num">{fmtVar(x.diferencia)}</td><td><button type="button" className="btn small" onClick={() => setDetalleId(x.id)}>Ver</button></td></tr>)}</tbody>
              </table>
            )}
          </Seccion>

          <Seccion letra="E" titulo="Riesgo de doble facturación" sub="Recibos con lectura promediada o estimada cuyo período se cruza con consumo real de otra cuenta o medidor de la misma sede.">
            {d.dobleCobro.casos.length === 0 ? <EstadoVacio compacto titulo="Sin cruces">Ningún recibo estimado se superpone con lecturas reales de otra cuenta o medidor{d.desglose.sinDetalle.length ? " (si falta cargar un recibo del período, el cruce no se puede ver)" : ""}.</EstadoVacio> : (
              <>
                <div className="con-calculo" style={{ marginBottom: 10 }}>
                  <div><span>Exposición central</span><strong>{fmtMoneda(d.dobleCobro.central)}</strong></div>
                  <div><span>Exposición máxima</span><strong>{fmtMoneda(d.dobleCobro.maximo)}</strong></div>
                  {d.dobleCobro.proximoPlazo && <div><span>Plazo para reclamar</span><strong>{fechaCorta(d.dobleCobro.proximoPlazo)}</strong><small className={d.dobleCobro.diasParaReclamar <= 15 ? "con-sube" : ""}>{d.dobleCobro.diasParaReclamar} día(s)</small></div>}
                </div>
                <table className="plain-table con-aud-tabla">
                  <thead><tr><th>Recibo estimado</th><th className="num">Consumo cobrado</th><th>Se cruza con</th><th className="num">Días</th><th className="num">Central</th><th className="num">Máximo</th><th>Reclamar antes de</th></tr></thead>
                  <tbody>{d.dobleCobro.casos.map((c) => <tr key={c.reciboId}><td>{c.mes} · cta {c.cuenta}</td><td className="num">{fmtNum(c.consumo, 0)} {u}</td><td className="con-aud-impl">{c.cruzaCon.join("; ")}</td><td className="num">{c.diasCruzados}</td><td className="num">{fmtMoneda(c.central)}</td><td className="num">{fmtMoneda(c.maximo)}</td><td>{c.plazoReclamo ? `${fechaCorta(c.plazoReclamo)} (${c.diasParaReclamar} d)` : "Sin fecha de expedición"}</td></tr>)}</tbody>
                </table>
                <p className="card-sub" style={{ marginTop: 8 }}>Central: el valor de la energía del recibo estimado en proporción a los días que se cruzan. Máximo: todo lo cobrado por energía en ese recibo. Plazo: 5 meses desde la expedición (art. 154, Ley 142 de 1994).</p>
              </>
            )}
          </Seccion>

          <Seccion letra="F" titulo="Crédito de conexión cobrado en el recibo" sub="Cuotas e intereses de financiación que vienen dentro de la factura.">
            {!d.credito ? <EstadoVacio compacto titulo="Sin crédito">Los recibos de la sede no traen cuotas de financiación.</EstadoVacio> : (
              <div className="con-calculo">
                <div><span>Último recibo con cuota</span><strong>{d.credito.mes}</strong></div>
                <div><span>Cuota de capital</span><strong>{fmtMoneda(d.credito.capital)}</strong></div>
                <div><span>Interés del período</span><strong>{fmtMoneda(d.credito.interes)}</strong></div>
                <div><span>Saldo del crédito</span><strong>{d.credito.saldo != null ? fmtMoneda(d.credito.saldo) : "No viene en los datos"}</strong></div>
                <div><span>Tasa efectiva anual aprox.</span><strong>{d.credito.tasaAnual != null ? pct(d.credito.tasaAnual) : "—"}</strong></div>
                <div><span>Cuotas restantes aprox.</span><strong>{d.credito.cuotas ?? "—"}</strong></div>
              </div>
            )}
          </Seccion>
        </>
      )}
      {detalleId && <DetalleReciboModal id={detalleId} acceso={acceso} onClose={() => setDetalleId(null)} onCambio={() => conAuditoria(f).then(setD)} onEditar={() => setDetalleId(null)} />}
    </div>
  );
}
