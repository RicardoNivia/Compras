"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { tesResumen, tesExplicar } from "@/lib/tesoreriaApi";
import KpiExplain from "@/components/KpiExplain";
import { fmtMoneda, fmtMonedaCorta } from "@/lib/moneda";
import ComboChartSvg from "@/components/charts/ComboChartSvg";
import HBarChartSvg from "@/components/charts/HBarChartSvg";
import { crossfade } from "@/lib/crossfade";
import { IconMoney, IconTrendUp, IconCalendar, IconCheck } from "@/components/icons";
import { MESES, anioActual, mesActual, SelectorPeriodo, fechaCorta } from "@/components/tesoreria/comun";
import { KpiRowSkeleton, CardSkeleton } from "@/components/tesoreria/Esqueletos";

// Resumen del flujo de caja: cifras calculadas en el backend (lib/tesoreria/resumen.js), siempre con su moneda ISO 4217.
export default function ResumenTesoreria() {
  const [vista, setVista] = useState("mensual");
  const [periodo, setPeriodo] = useState({ anio: anioActual(), mes: mesActual() });
  const [datos, setDatos] = useState(null);
  const [moneda, setMoneda] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let vivo = true;
    tesResumen(periodo.anio, vista === "mensual" ? periodo.mes : undefined)
      .then((r) => { if (!vivo) return; setDatos(r); setError(""); setMoneda((m) => (r.porMoneda.some((x) => x.moneda === m) ? m : r.porMoneda[0]?.moneda || "COP")); })
      .catch((e) => vivo && setError(e.message));
    return () => { vivo = false; };
  }, [periodo, vista]);

  const pm = datos?.porMoneda.find((x) => x.moneda === moneda);
  const k = pm?.kpis;
  const fm = (v) => fmtMoneda(v, moneda || "COP");
  const pct = (v) => (v == null ? null : `${v > 0 ? "+" : ""}${v.toLocaleString("es-CO")} % vs. mes anterior`);
  const etiquetaPeriodo = vista === "mensual" ? `${MESES[periodo.mes - 1]} ${periodo.anio}` : `${periodo.anio}`;

  return (
    <div className="dashboard-shell tes-resumen">
      <div className="card-head" style={{ marginBottom: 14, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="dash-tabs" role="tablist" aria-label="Periodo">
            <button type="button" role="tab" aria-selected={vista === "mensual"} className="dash-tab" onClick={() => crossfade(() => setVista("mensual"))}>Mensual</button>
            <button type="button" role="tab" aria-selected={vista === "anual"} className="dash-tab" onClick={() => crossfade(() => setVista("anual"))}>Anual</button>
          </div>
          <SelectorPeriodo anio={periodo.anio} mes={vista === "mensual" ? periodo.mes : null} onCambio={(p) => setPeriodo({ anio: p.anio, mes: p.mes || periodo.mes })} id="tes-resumen" />
          {datos?.porMoneda.length > 1 && (
            <div className="field" style={{ width: 120 }}>
              <label htmlFor="tes-moneda">Moneda (ISO 4217)</label>
              <select id="tes-moneda" value={moneda || ""} onChange={(e) => setMoneda(e.target.value)}>
                {datos.porMoneda.map((m) => <option key={m.moneda}>{m.moneda}</option>)}
              </select>
            </div>
          )}
        </div>
        <Link href="/tesoreria/movimientos?nuevo=soporte" className="btn btn-primary">+ Registrar con soporte</Link>
      </div>
      {error && <p className="modal-error">{error}</p>}
      {!datos && !error && <><KpiRowSkeleton count={5} /><CardSkeleton height={240} /></>}

      {datos && !pm && <div className="card"><p className="muted" style={{ margin: 0 }}>No hay movimientos en {etiquetaPeriodo}.</p></div>}

      {pm && (
        <>
          <div className="kpi-row kpi-row-5">
            {[
              { label: `Ingresos · ${etiquetaPeriodo}`, valor: fm(k.ingresos), sub: pct(pm.comparacion?.ingresosPct) || "Ejecutados", color: "var(--accent)", Icon: IconTrendUp },
              { label: `Egresos · ${etiquetaPeriodo}`, valor: fm(k.egresos), sub: pct(pm.comparacion?.egresosPct) || "Ejecutados", color: "var(--warning)", Icon: IconMoney },
              { label: "Flujo neto", valor: fm(k.neto), sub: "Sin traslados entre cuentas propias", color: k.neto >= 0 ? "var(--good)" : "var(--critical)", Icon: IconMoney },
              { label: "Proyectado sin ejecutar", valor: fm(k.egresosProyectados), sub: `egresos · ingresos ${fm(k.ingresosProyectados)}`, color: "var(--secondary)", Icon: IconCalendar },
              { label: "Sin conciliar", valor: k.sinConciliar.toLocaleString("es-CO"), sub: <>de {k.movimientos.toLocaleString("es-CO")} movimientos · <Link href="/tesoreria/conciliacion">conciliar</Link></>, color: k.sinConciliar ? "var(--warning)" : "var(--good)", Icon: IconCheck, texto: `${k.sinConciliar} de ${k.movimientos} movimientos sin conciliar` },
            ].map((t) => (
              <div key={t.label} className="kpi" style={{ "--kpi-c": t.color }}>
                <div className="kpi-head"><div className="label">{t.label}</div><div className="kpi-ic"><t.Icon size={14} /></div></div>
                <div className="value">{t.valor}</div>
                <div className="card-sub">{t.sub}</div>
                {/* «Explicar» como en los otros dashboards: las cifras las recalcula el servidor (/api/tesoreria/explicar). */}
                <KpiExplain key={`${t.label}|${vista}|${periodo.anio}|${periodo.mes}|${moneda}`} label={t.label} value={t.texto || t.valor}
                  explicar={() => tesExplicar({ anio: periodo.anio, mes: vista === "mensual" ? periodo.mes : null, moneda, label: t.label, valor: t.texto || t.valor })}
                  pie="Generado por Nova con las cifras del período (ejecutadas, sin traslados entre cuentas propias)." />
              </div>
            ))}
          </div>

          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-head"><h3 style={{ margin: 0 }}>Ingresos y egresos de {periodo.anio}</h3><span className="card-sub">Ejecutados · {moneda}</span></div>
            <ComboChartSvg
              data={pm.porMes.map((m) => ({ key: m.mes, label: m.nombre, bar: m.egresos, line: m.ingresos }))}
              barName="Egresos" lineName="Ingresos" formatBar={fm} formatLine={fm}
              barColor="var(--secondary)" lineColor="var(--accent)"
            />
          </div>

          <div className="tes-dos">
            <div className="card">
              <div className="card-head"><h3 style={{ margin: 0 }}>Egresos por ítem</h3><span className="card-sub">{etiquetaPeriodo}</span></div>
              {pm.egresosPorItem.length
                ? <HBarChartSvg data={pm.egresosPorItem.slice(0, 10).map((x) => ({ key: x.id, label: x.nombre, value: x.valor }))} formatValue={fm} formatLabel={(v) => fmtMonedaCorta(v, moneda)} />
                : <p className="muted">Sin egresos ejecutados.</p>}
            </div>
            <div className="card">
              <div className="card-head"><h3 style={{ margin: 0 }}>Saldos por cuenta</h3><span className="card-sub">hoy, según el libro</span></div>
              <ul className="tes-lista">
                {datos.saldos.map((s) => (
                  <li key={s.id}>
                    <span><strong>{s.nombre}</strong><small>{s.tipo}{s.desde ? ` · desde ${fechaCorta(s.desde)}` : " · sin saldo inicial"}</small></span>
                    <strong className={s.saldo < 0 ? "tes-neg" : ""}>{s.saldoTexto}</strong>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="card" style={{ marginTop: 14 }}>
            <div className="card-head">
              <h3 style={{ margin: 0 }}>Próximos pagos y cobros (proyectados)</h3>
              {datos.proyectadosVencidos > 0 && <Link href="/tesoreria/movimientos?estado=proyectado" className="pill warning">{datos.proyectadosVencidos} proyectado(s) vencido(s)</Link>}
            </div>
            {datos.proximos.length ? (
              <ul className="tes-lista">
                {datos.proximos.map((p) => (
                  <li key={p.id}>
                    <span><strong>{fechaCorta(p.fecha)} · {p.concepto}</strong><small>{[p.item, p.cuenta].filter(Boolean).join(" · ")}</small></span>
                    <strong className={p.tipo === "egreso" ? "tes-neg" : "tes-pos"}>{p.tipo === "egreso" ? "−" : "+"}{p.valorTexto}</strong>
                  </li>
                ))}
              </ul>
            ) : <p className="muted" style={{ margin: 0 }}>No hay pagos proyectados en los próximos 30 días.</p>}
          </div>
        </>
      )}
    </div>
  );
}
