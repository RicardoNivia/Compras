"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { conAnalisis } from "@/lib/consumoApi";
import { fmtMoneda, fmtMonedaCorta } from "@/lib/moneda";
import { crossfade } from "@/lib/crossfade";
import ComboChartSvg from "@/components/charts/ComboChartSvg";
import EstadoVacio from "@/components/EstadoVacio";
import { IconGauge, IconAlert, IconCheck } from "@/components/icons";
import { SERVICIOS, ORDEN_SERVICIOS, PuntoServicio, useCatalogosConsumo, fmtNum } from "@/components/consumo/comun";

// Dashboard de Consumo = la hoja «Resumen Ejecutivo» del Excel del contador: ocho indicadores (antes → después del
// cambio de cuenta o medidor, o primera mitad frente a segunda), conclusiones escritas con esas cifras, las gráficas de
// consumo y costo, y la tabla por cuenta (o por sede). Todo sale de backend/lib/consumo/analisis.js#resumen.
const TONO = { bueno: "var(--good)", malo: "var(--critical)", alerta: "var(--warning)", neutro: "var(--accent)" };
const SERVICIOS_CON_CONSUMO = ORDEN_SERVICIOS.filter((s) => s !== "aseo");

export default function ResumenConsumo() {
  const { cat } = useCatalogosConsumo();
  const [f, setF] = useState({ sedeId: "", servicio: "energia", anio: "" });
  const [d, setD] = useState(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);
  useEffect(() => {
    setCargando(true);
    conAnalisis(f).then((r) => { setD(r); setError(""); }).catch((e) => setError(e.message)).finally(() => setCargando(false));
  }, [f]);
  const cambiar = (campo) => (e) => crossfade(() => setF((x) => ({ ...x, [campo]: e.target.value, ...(campo === "servicio" || campo === "sedeId" ? { anio: "" } : {}) })));

  // Lo que falta configurar: sedes activas sin ninguna cuenta (Nova no reconoce sus recibos).
  const sinCuenta = useMemo(() => (cat?.sedes || []).filter((s) => s.activo && !s.cuentas.some((c) => !c.noAplica)), [cat]);
  const u = d?.unidad;

  return (
    <div className="dashboard-shell con-dash" style={{ opacity: cargando && d ? 0.7 : 1, transition: "opacity .2s ease" }}>
      <div className="con-dash-barra">
        <div>
          <div className="con-dash-sobre">Resumen ejecutivo · {d?.sede || "todas las sedes"}</div>
          <h2>{d && !d.vacio ? `${SERVICIOS[d.servicio].nombre}: ${d.periodo}` : "Consumo de las sedes"}</h2>
          {d && !d.vacio && <p>{d.recibos} recibo(s) · {d.corte}</p>}
        </div>
        <div className="con-dash-filtros">
          <div className="field"><label htmlFor="cd-sede">Sede</label><select id="cd-sede" value={f.sedeId} onChange={cambiar("sedeId")}><option value="">Todas las sedes</option>{(d?.sedes || []).map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select></div>
          <div className="field"><label htmlFor="cd-serv">Servicio</label><select id="cd-serv" value={f.servicio} onChange={cambiar("servicio")}>{SERVICIOS_CON_CONSUMO.map((s) => <option key={s} value={s}>{SERVICIOS[s].nombre}</option>)}</select></div>
          <div className="field"><label htmlFor="cd-anio">Año</label><select id="cd-anio" value={f.anio} onChange={cambiar("anio")}><option value="">Todos</option>{(d?.anios || []).map((a) => <option key={a} value={a}>{a}</option>)}</select></div>
        </div>
      </div>

      {error && <div className="modal-error">{error}</div>}
      {!d && !error && <div className="kpi-row" aria-hidden="true">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="kpi"><div className="skeleton-bar" style={{ height: 70, borderRadius: 10 }} /></div>)}</div>}
      {d?.vacio && (
        <div className="card"><EstadoVacio titulo="Sin recibos para este filtro" icono={<IconGauge size={22} />} accion={<Link className="btn btn-primary" href="/consumo/subir">Subir recibos</Link>}>
          Cuando haya recibos de {SERVICIOS[d.servicio].nombre.toLowerCase()} aquí verás cuánto consume y cuánto cuesta, antes y después de cada cambio.
        </EstadoVacio></div>
      )}

      {d && !d.vacio && (
        <>
          <div className="con-kpis">
            {d.kpis.map((k) => (
              <div key={k.k} className="kpi kpi-edge" style={{ "--kpi-c": TONO[k.tono] }}>
                <div className="kpi-head"><span className="label">{k.titulo}</span></div>
                <div className="value" style={k.tono === "malo" ? { color: "var(--critical)" } : k.tono === "bueno" && k.k !== "dobleCobro" ? { color: "var(--good)" } : undefined}>{k.valor}</div>
                <div className="foot">{k.nota}</div>
              </div>
            ))}
          </div>

          <div className="card con-conclusiones">
            <h3>Conclusiones principales</h3>
            <p className="card-sub">Escritas con las mismas cifras de los indicadores. {d.unaSede ? <Link href={`/consumo/auditoria?sedeId=${d.filtro.sedeId || d.porCuenta[0]?.sedeId || ""}`}>Ver auditoría y hallazgos de esta sede</Link> : <Link href="/consumo/auditoria">Ver auditoría y hallazgos</Link>}</p>
            <ul>{d.conclusiones.map((c) => <li key={c}>{c}</li>)}</ul>
            {d.conclusiones.length === 0 && <p className="card-sub">No hay nada que resaltar con los recibos del filtro.</p>}
          </div>

          <div className="grid-2 con-dash-graf">
            <div className="card">
              <h3>{d.unaSede ? `Consumo y ${u}/día por recibo` : "Consumo y costo efectivo por mes"}</h3>
              <p className="card-sub">{d.unaSede ? `Barras: ${u} facturados · línea: ${u} por día (sube si se consume más, sin importar los días del período)` : `Barras: ${u} de todas las sedes · línea: costo efectivo por ${u}`}</p>
              <ComboChartSvg data={d.porPeriodo.map((p) => ({ key: p.key, label: p.label, bar: p.consumo || 0, line: (d.unaSede ? p.consumoDia : p.costoEfectivo) || 0 }))}
                barName={`Consumo (${u})`} lineName={d.unaSede ? `${u} por día` : `COP por ${u}`} formatBar={(v) => `${fmtNum(v, 0)} ${u}`} formatLine={(v) => (d.unaSede ? `${fmtNum(v, 1)} ${u}/día` : fmtMoneda(v))} />
            </div>
            <div className="card">
              <h3>Total cargos y tarifa unitaria</h3>
              <p className="card-sub">Barras: lo facturado por el servicio (sin aseo) · línea: valor por {u}</p>
              <ComboChartSvg data={d.porPeriodo.map((p) => ({ key: p.key, label: p.label, bar: p.totalCargos || 0, line: p.tarifa || 0 }))}
                barName="Total cargos" lineName={`COP por ${u}`} formatBar={fmtMoneda} formatLine={(v) => `COP ${fmtNum(v, 2)}`} barColor="var(--c-energia)" />
            </div>
          </div>

          <div className="grid-2">
            <div className="card">
              <h3>{d.unaSede ? "Por cuenta y medidor" : "Por sede"}</h3>
              <p className="card-sub">Gasto, consumo y costo efectivo (todo incluido) de cada {d.unaSede ? "cuenta" : "sede"}</p>
              <table className="plain-table con-tabla-cuentas">
                <thead><tr><th>{d.unaSede ? "Cuenta / medidor" : "Sede"}</th><th className="num">Gasto</th><th className="num">{u}</th><th className="num">COP/{u}</th></tr></thead>
                <tbody>
                  {d.porCuenta.slice(0, 8).map((c) => (
                    <tr key={c.key}>
                      <td><span className="desc-tooltip-wrap"><span className="desc-text">{c.nombre}</span><span className="desc-tooltip-bubble">{c.nombre} · {c.detalle}</span></span><small className="muted con-td-sub">{c.detalle}</small></td>
                      <td className="num">{fmtMoneda(c.gasto)}</td><td className="num">{fmtNum(c.consumo, 0)}</td><td className="num">{c.costoEfectivo != null ? fmtMoneda(c.costoEfectivo) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {d.porCuenta.length > 8 && <p className="card-sub" style={{ marginTop: 8 }}>Se muestran las 8 de mayor gasto. <Link href="/consumo/recibos">Ver todos los recibos</Link></p>}
            </div>
            <div className="card">
              <h3>Cálculos de los indicadores</h3>
              <p className="card-sub">Así se armó cada cifra (antes → después)</p>
              <table className="plain-table con-tabla-cuentas">
                <tbody>
                  <tr><td>{u} por día (solo lecturas reales)</td><td className="num">{fmtNum(d.calculos.antes.consumoDia)} → {fmtNum(d.calculos.despues.consumoDia)}</td></tr>
                  <tr><td>Costo efectivo por {u}</td><td className="num">{fmtMonedaCorta(d.calculos.antes.costoEfectivo)} → {fmtMonedaCorta(d.calculos.despues.costoEfectivo)}</td></tr>
                  <tr><td>Tarifa unitaria promedio</td><td className="num">{fmtNum(d.calculos.antes.tarifa, 2)} → {fmtNum(d.calculos.despues.tarifa, 2)}</td></tr>
                  <tr><td>Costo por día</td><td className="num">{fmtMoneda(d.calculos.antes.costoDia)} → {fmtMoneda(d.calculos.despues.costoDia)}</td></tr>
                  <tr><td>Recibos en cada lado</td><td className="num">{d.calculos.antes.recibos} → {d.calculos.despues.recibos}</td></tr>
                  <tr><td>Exposición por doble cobro (central · máximo)</td><td className="num">{fmtMoneda(d.calculos.dobleCobro.central)} · {fmtMoneda(d.calculos.dobleCobro.maximo)}</td></tr>
                </tbody>
              </table>
              <p className="card-sub" style={{ marginTop: 8 }}>{d.corte} El aseo que viene en el recibo de energía no entra en el costo.</p>
            </div>
          </div>
        </>
      )}

      {sinCuenta.length > 0 && (
        <div className="card con-pendiente">
          <span className="con-pendiente-ic"><IconAlert size={16} /></span>
          <div><strong>{sinCuenta.length} sede(s) sin ninguna cuenta de servicio</strong><p>{sinCuenta.map((s) => s.nombre).join(" · ")}. Al confirmar la sede del primer recibo que subas, la cuenta queda creada.</p></div>
          <Link className="btn small" href="/consumo/sedes">Ir a Sedes y cuentas</Link>
        </div>
      )}
      {cat && sinCuenta.length === 0 && d && !d.vacio && <p className="card-sub con-listo"><IconCheck size={13} /> Todas las sedes activas tienen al menos una cuenta: Nova reconoce sus recibos.</p>}
    </div>
  );
}
