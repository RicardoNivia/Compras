"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { tesResumen, tesProyeccion } from "@/lib/tesoreriaApi";
import { fmtMoneda, fmtMonedaCorta } from "@/lib/moneda";
import { crossfade } from "@/lib/crossfade";
import KpiExplain from "@/components/KpiExplain";
import EstadoVacio from "@/components/EstadoVacio";
import { ResumenEsqueleto } from "@/components/tesoreria/Esqueletos";
import { MESES, MESES_CORTOS, anioActual, mesActual, fechaSinAnio, TipoPago, Dinero, BotonExcel, SelectorAnio } from "@/components/tesoreria/comun";
import DivergentBarChartSvg from "@/components/charts/DivergentBarChartSvg";
import LineChartSvg from "@/components/charts/LineChartSvg";
import HBarChartSvg from "@/components/charts/HBarChartSvg";
import PieChartSvg from "@/components/charts/PieChartSvg";
import GaugeSvg from "@/components/charts/GaugeSvg";
import Sparkline from "@/components/charts/Sparkline";
import { AnimatedNumber } from "@/components/charts/chartKit";
import { IconTrendUp, IconClock, IconAlert, IconBuilding } from "@/components/icons";

const COP = (v) => fmtMoneda(v, "COP");
const CORTO = (v) => fmtMonedaCorta(v, "COP");
const COLORES_BANCO = ["var(--secondary)", "var(--good)", "var(--warning)", "var(--critical)", "var(--s1)"];
const sinNulos = (s) => s.filter((v) => v != null);

// Dashboard de Tesorería, con el mismo formato que el Dashboard de Compras (components/DashboardView.jsx): Mensual /
// Anual, año y mes, una fila de KPIs grandes con «Explicar» (Nova) y otra de KPIs pequeños, y tarjetas en grid-2.
// Flujo de caja (lo que entra arriba, lo que sale abajo, el neto en línea), saldo de cada banco mes a mes (anclado a los
// extractos), en qué se va la plata, medio de pago, cumplimiento de los pagos, vencidos y próximos. Tocar un mes abre
// ese mes; tocar un ítem abre sus pagos. Cifras del backend (lib/tesoreria/resumen.js#armarTablero).
export default function ResumenTesoreria() {
  const router = useRouter();
  const [vista, setVista] = useState("mensual");
  const [anio, setAnio] = useState(anioActual());
  const [mes, setMes] = useState(mesActual());
  const [d, setD] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true);
    try { setD(await tesResumen(anio, mes, vista)); setError(""); } catch (e) { setError(e.message); } finally { setCargando(false); }
  }, [anio, mes, vista]);
  useEffect(() => { cargar(); }, [cargar]);

  if (error && !d) return <p className="modal-error">{error}</p>;
  if (!d) return <ResumenEsqueleto />;
  const t = d.tablero;
  const k = t.kpis;
  const anual = vista === "anual";
  const periodo = anual ? `${anio}` : `${MESES[mes - 1].toLowerCase()} ${anio}`;
  const qsPeriodo = `anio=${anio}&mes=${anual ? "todo" : mes}`;
  // Comparación del flujo neto contra el mes anterior (vista mensual).
  const netoPrev = !anual && mes > 1 ? t.flujo[mes - 2].neto : null;
  const delta = netoPrev ? ((k.neto.valor - netoPrev) / Math.abs(netoPrev)) * 100 : null;
  const cumpleColor = k.cumplimiento.pct == null ? "var(--muted)" : k.cumplimiento.pct >= 90 ? "var(--good)" : k.cumplimiento.pct >= 70 ? "var(--warning)" : "var(--critical)";
  const irMes = (m) => crossfade(() => { setVista("mensual"); setMes(m); });
  const bancoMayor = [...t.bancos].filter((b) => b.saldo != null).sort((a, b) => b.saldo - a.saldo)[0];
  const itemMayor = t.porItem[0];
  const egresoMayor = t.grandes[0];
  const conDiferencia = t.bancos.filter((b) => b.diferencias);

  // Tesorería sin ningún dato (recién instalada o vaciada): un solo estado vacío con lo que hay que hacer primero.
  if (!t.bancos.length && !d.porMes.some((x) => x.pagos)) {
    return (
      <div className="dashboard-shell">
        <div className="card">
          <EstadoVacio icono={<IconBuilding size={24} />} titulo="Tesorería todavía no tiene datos"
            accion={<><Link className="btn btn-primary" href="/tesoreria/importar">Importar la plantilla de flujo de caja</Link><Link className="btn" href="/tesoreria/maestros">Crear los bancos a mano</Link></>}>
            Sube el Excel de flujo de caja: se crean los bancos, los movimientos, los pagos programados y los gastos periódicos, y este dashboard se llena solo.
          </EstadoVacio>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-shell" style={{ opacity: cargando ? 0.75 : 1, transition: "opacity .2s ease" }}>
      <div className="card-head" style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
          <div className="dash-tabs" role="tablist" aria-label="Periodo del dashboard">
            <button type="button" role="tab" aria-selected={!anual} className="dash-tab" onClick={() => crossfade(() => setVista("mensual"))}>Mensual</button>
            <button type="button" role="tab" aria-selected={anual} className="dash-tab" onClick={() => crossfade(() => setVista("anual"))}>Anual</button>
          </div>
          <SelectorAnio id="td-anio" value={anio} onChange={(a) => a && setAnio(a)} ancho={160} />
          {!anual && (
            <div className="field" style={{ width: 170 }}>
              <label htmlFor="td-mes">Mes</label>
              <select id="td-mes" value={mes} onChange={(e) => setMes(Number(e.target.value))}>{MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
            </div>
          )}
        </div>
        <div className="spacer" />
        <BotonExcel nombre={`tesoreria-dashboard-${anio}`} hoja="Flujo mes a mes" filas={t.flujo.map((x, i) => ({ ...x, saldo: t.serieSaldo[i] }))} columnas={[
          { t: "Mes", v: (x) => MESES[x.mes - 1] }, { t: "Entra (COP)", v: (x) => x.ingresos }, { t: "Sale (COP)", v: (x) => -x.egresos },
          { t: "Neto (COP)", v: (x) => x.neto }, { t: "Saldo en bancos al cierre (COP)", v: (x) => x.saldo },
        ]} />
      </div>
      {error && <div className="modal-error" style={{ marginBottom: 14 }}>{error}</div>}

      {/* KPIs principales */}
      <div className="kpi-row">
        <div className="kpi" style={{ "--kpi-c": "var(--accent)" }}>
          <div className="kpi-head"><div className="label">Saldo en bancos</div><div className="kpi-ic"><IconBuilding size={14} /></div></div>
          <div className="value" style={{ color: k.saldo.valor < 0 ? "var(--critical)" : undefined }}>{k.saldo.valor == null ? "—" : <AnimatedNumber value={k.saldo.valor} format={COP} />}</div>
          {sinNulos(k.saldo.serie).length > 1 && <Sparkline data={sinNulos(k.saldo.serie)} color="var(--accent)" />}
          <div className="foot">{k.saldo.conSaldo} de {k.saldo.bancos} banco(s) · se ajusta con cada extracto</div>
          <KpiExplain label="Saldo en bancos" value={k.saldo.valor == null ? "—" : COP(k.saldo.valor)}
            records={t.bancos.map((b) => ({ banco: b.banco, saldo: b.saldo, ultimoExtracto: b.ultimoSaldoBanco?.dia || null, saldoAlCierreDeCadaMes: b.serie }))} />
        </div>
        <div className="kpi" style={{ "--kpi-c": k.neto.valor >= 0 ? "var(--good)" : "var(--critical)" }}>
          <div className="kpi-head"><div className="label">Flujo neto · {periodo}</div><div className="kpi-ic"><IconTrendUp size={14} /></div></div>
          <div className="value" style={{ color: k.neto.valor < 0 ? "var(--critical)" : undefined }}><AnimatedNumber value={k.neto.valor} format={COP} /></div>
          {delta != null && (
            <div className={`delta delta-chip ${delta > 0 ? "up" : delta < 0 ? "down" : ""}`} title={`Frente a ${MESES[mes - 2].toLowerCase()}: ${COP(netoPrev)}`}>
              {delta > 0 ? "▲" : delta < 0 ? "▼" : "＝"} {Math.abs(delta).toFixed(1)}% <span className="delta-vs">vs mes anterior</span>
            </div>
          )}
          <Sparkline data={k.neto.serie} color={k.neto.valor >= 0 ? "var(--good)" : "var(--critical)"} />
          <KpiExplain label={`Flujo neto de ${periodo}`} value={COP(k.neto.valor)} comparisonLabel={netoPrev != null ? "mes anterior" : undefined} comparisonValue={netoPrev != null ? COP(netoPrev) : null}
            records={t.flujo.map((x) => ({ mes: MESES[x.mes - 1], entra: x.ingresos, sale: -x.egresos, neto: x.neto }))} />
        </div>
        <div className="kpi" style={{ "--kpi-c": cumpleColor }}>
          <div className="kpi-head"><div className="label">Pagos al día</div><div className="kpi-ic"><IconClock size={14} /></div></div>
          <div className="value">{k.cumplimiento.pct == null ? "—" : <AnimatedNumber value={Math.round(k.cumplimiento.pct)} format={(v) => `${v}%`} />}</div>
          <div className="meter-track"><div className="meter-fill" style={{ width: `${k.cumplimiento.pct || 0}%` }} /></div>
          <div className="foot">{k.cumplimiento.debian ? `${k.cumplimiento.pagados} de ${k.cumplimiento.debian} pagos ya vencidos están pagados` : "Nada vencía en el período"}</div>
          <KpiExplain label={`Pagos al día en ${periodo}`} value={k.cumplimiento.pct == null ? "—" : `${Math.round(k.cumplimiento.pct)}%`}
            records={[{ debianPagarse: k.cumplimiento.debian, pagados: k.cumplimiento.pagados, enMora: k.cumplimiento.vencidos, valorEnMora: -k.cumplimiento.valorVencido }, ...t.vencidos.map((p) => ({ concepto: p.concepto, vencio: p.fecha, diasDeMora: p.dias, valor: p.valor }))]} />
        </div>
        <div className="kpi" style={{ "--kpi-c": "var(--critical)" }}>
          <div className="kpi-head"><div className="label">Vencidos sin pagar</div><div className="kpi-ic"><IconAlert size={14} /></div></div>
          <div className="value"><AnimatedNumber value={d.vencidos.cantidad} format={(v) => Math.round(v).toLocaleString("es-CO")} /></div>
          <div className="foot">{d.vencidos.cantidad ? `${d.vencidos.valorTexto} · el más viejo hace ${d.vencidos.diasMasViejo} días` : "Nada vencido"}</div>
          <KpiExplain label="Pagos vencidos sin pagar" value={`${d.vencidos.cantidad} por ${d.vencidos.valorTexto}`} records={t.vencidos.map((p) => ({ concepto: p.concepto, item: p.item, vencio: p.fecha, diasDeMora: p.dias, valor: p.valor }))} />
        </div>
      </div>

      <div className="kpi-row kpi-row-5">
        <Link className="kpi tes-dash-kpi" href={`/tesoreria/pagos?${qsPeriodo}&sentido=ingreso`}><div className="label">Entra · {periodo}</div><div className="value" style={{ color: "var(--good)" }}>{CORTO(k.ingresos.valor)}</div><div className="foot">recibido {CORTO(k.ingresos.recibido)}</div></Link>
        <Link className="kpi tes-dash-kpi" href={`/tesoreria/pagos?${qsPeriodo}&sentido=egreso`}><div className="label">Sale · {periodo}</div><div className="value" style={{ color: "var(--critical)" }}>{CORTO(-k.egresos.valor)}</div><div className="foot">pagado {CORTO(-k.egresos.pagado)}</div></Link>
        <Link className="kpi tes-dash-kpi" href={`/tesoreria/pagos?${qsPeriodo}&sentido=egreso&filtro=P`}><div className="label">Por pagar</div><div className="value">{CORTO(-k.egresos.pendiente)}</div><div className="foot">egresos en P</div></Link>
        <Link className="kpi tes-dash-kpi" href={`/tesoreria/pagos?${qsPeriodo}&sentido=ingreso&filtro=P`}><div className="label">Por recibir</div><div className="value">{CORTO(k.ingresos.pendiente)}</div><div className="foot">ingresos en P</div></Link>
        <Link className="kpi tes-dash-kpi" href="/tesoreria/agentes"><div className="label">Movimientos sin asociar</div><div className="value">{t.movimientos.sinAsociar.toLocaleString("es-CO")}</div><div className="foot">de {t.movimientos.total} · {d.propuestas.total} propuesta(s) del agente</div></Link>
      </div>

      <ProyeccionCaja />

      {/* Flujo de caja / Resumen ejecutivo */}
      <div className="grid-2">
        <div className="card">
          <h3>Flujo de caja {anio}</h3>
          <p className="card-sub">Pagos programados de cada mes: lo que entra arriba, lo que sale abajo y el neto. Toca un mes para verlo.</p>
          <DivergentBarChartSvg
            data={t.flujo.map((x) => ({ key: x.mes, label: MESES_CORTOS[x.mes - 1], arriba: x.ingresos, abajo: x.egresos, linea: x.neto, destacado: !anual && x.mes === mes }))}
            nombres={{ arriba: "Entra", abajo: "Sale", linea: "Neto" }} format={COP} formatCorto={CORTO} onSelect={(x) => irMes(x.key)} />
        </div>
        <div className="card">
          <h3>Resumen ejecutivo</h3>
          <div className="summary-grid">
            <div className="detail-item"><div className="dlabel">Saldo hoy en bancos</div><div className="dvalue">{k.saldo.valor == null ? "—" : COP(k.saldo.valor)}</div><div className="dcap">{bancoMayor ? `Mayor: ${bancoMayor.banco}` : "Sin saldos"}</div></div>
            <div className="detail-item"><div className="dlabel">Flujo neto</div><div className="dvalue">{COP(k.neto.valor)}</div><div className="dcap">{k.neto.valor >= 0 ? "entra más de lo que sale" : "sale más de lo que entra"}</div></div>
            <div className="detail-item"><div className="dlabel">Ítem con más egresos</div><div className="dvalue">{itemMayor ? itemMayor.nombre : "—"}</div><div className="dcap">{itemMayor ? `${COP(-itemMayor.valor)} · ${Math.round((itemMayor.valor / (k.egresos.valor || 1)) * 100)}%` : "Sin egresos"}</div></div>
            <div className="detail-item"><div className="dlabel">Egreso más grande</div><div className="dvalue">{egresoMayor ? egresoMayor.valorTexto : "—"}</div><div className="dcap">{egresoMayor ? `${egresoMayor.concepto} · ${fechaSinAnio(egresoMayor.fecha)}` : "Sin egresos"}</div></div>
            <div className="detail-item"><div className="dlabel">Pagos del período</div><div className="dvalue">{t.pagos.pagados} / {t.pagos.total}</div><div className="dcap">pagados · {t.pagos.pendientes} pendiente(s)</div></div>
            <div className="detail-item"><div className="dlabel">Extractos</div><div className="dvalue">{conDiferencia.length ? `${conDiferencia.length} banco(s) con diferencia` : "Cuadran"}</div><div className="dcap">{conDiferencia.length ? conDiferencia.map((b) => b.banco).join(", ") : "lo registrado coincide con el banco"}</div></div>
            <div className="detail-item"><div className="dlabel">Propuestas del agente</div><div className="dvalue">{d.propuestas.total}</div><div className="dcap">{d.propuestas.alta} de confianza alta</div></div>
            <div className="detail-item"><div className="dlabel">Alertas de la importación</div><div className="dvalue">{d.alertasAbiertas}</div><div className="dcap">{d.alertasAbiertas ? <Link href="/alertas">verlas en Mi día</Link> : "ninguna abierta"}</div></div>
          </div>
        </div>
      </div>

      {/* Saldo de bancos / Medio de pago */}
      <div className="grid-2">
        <div className="card">
          <h3>Saldo en bancos {anio}</h3>
          <p className="card-sub">Saldo al cierre de cada mes, anclado al último extracto de cada banco. <Link href="/tesoreria/saldos">Ver saldos</Link></p>
          <LineChartSvg
            labels={MESES_CORTOS.map((m, i) => ({ key: i + 1, label: m, destacado: !anual && i + 1 === mes }))}
            series={[
              ...(t.bancos.length > 1 ? [{ name: "Total", color: "var(--accent)", values: t.serieSaldo }] : []),
              ...t.bancos.map((b, i) => ({ name: b.banco, color: t.bancos.length > 1 ? COLORES_BANCO[i % COLORES_BANCO.length] : "var(--accent)", values: b.serie })),
            ]}
            format={COP} formatCorto={CORTO} onSelect={(l) => irMes(l.key)} />
        </div>
        <div className="card">
          <h3>Por medio de pago</h3>
          <p className="card-sub">Cómo sale la plata en {periodo}.</p>
          {t.porMedio.length ? <PieChartSvg data={t.porMedio.map((x) => ({ name: x.nombre, value: x.valor }))} formatValue={COP} /> : <div className="empty">No hay egresos en {periodo}.</div>}
        </div>
      </div>

      {/* En qué se va la plata / Cumplimiento */}
      <div className="grid-2">
        <div className="card">
          <h3>¿En qué se va la plata?</h3>
          <p className="card-sub">Egresos de {periodo} por ítem{t.porItemTotal > 8 ? ` (los 8 mayores de ${t.porItemTotal})` : ""}. Toca uno para ver sus pagos.</p>
          {t.porItem.length ? (
            <HBarChartSvg data={t.porItem.map((x) => ({ key: x.id || "sin", label: x.nombre, value: x.valor, detalle: `${Math.round((x.valor / (k.egresos.valor || 1)) * 100)}% de lo que sale`, id: x.id }))}
              formatValue={COP} formatLabel={CORTO} color="var(--critical)" onSelect={(x) => x.id && router.push(`/tesoreria/pagos?${qsPeriodo}&item=${x.id}`)} />
          ) : <div className="empty">No hay egresos en {periodo}.</div>}
        </div>
        <div className="card">
          <h3>Cumplimiento de pagos</h3>
          <div className="gauge-wrap">
            <GaugeSvg percent={k.cumplimiento.pct ?? 0} />
            <div className="gauge-foot">{k.cumplimiento.debian ? `${k.cumplimiento.pagados} de ${k.cumplimiento.debian} pagos que ya vencían están pagados (E)` : "Ningún pago vencía todavía"}</div>
            <div className="gauge-breakdown" style={{ width: "100%" }}>
              <Barra nombre="Pagados" n={t.pagos.pagados} total={t.pagos.total} color="var(--good)" />
              <Barra nombre="Pendientes" n={t.pagos.pendientes} total={t.pagos.total} color="var(--warning)" />
              <Barra nombre="En mora" n={k.cumplimiento.vencidos} total={t.pagos.total} color="var(--critical)" detalle={k.cumplimiento.vencidos ? COP(-k.cumplimiento.valorVencido) : null} />
              <Barra nombre="Con movimiento" n={t.pagos.conMovimiento} total={t.pagos.total} color="var(--accent)" detalle="asociados al banco" />
            </div>
          </div>
        </div>
      </div>

      {/* Vencidos / Próximos */}
      <div className="grid-2">
        <div className="card">
          <h3>Vencidos sin pagar</h3>
          <p className="card-sub">Los más antiguos primero. <Link href="/tesoreria/pagos?filtro=vencidos">Ver todos ({d.vencidos.cantidad})</Link></p>
          {t.vencidos.length ? t.vencidos.map((p) => (
            <Link key={p.id} href={`/tesoreria/pagos?id=${p.id}`} className="tes-tarea tes-dash-fila-link">
              <span className="pill critical">hace {p.dias} d</span>
              <div><strong>{p.concepto}</strong><small>{[fechaSinAnio(p.fecha), p.item].filter(Boolean).join(" · ")}</small></div>
              <Dinero valor={p.valor} texto={p.valorTexto} fuerte />
            </Link>
          )) : <div className="empty">Nada vencido.</div>}
        </div>
        <div className="card">
          <h3>Próximos 7 días</h3>
          <p className="card-sub">Lo que vence esta semana. <Link href="/tesoreria/pagos">Ver pagos</Link></p>
          {d.proximos.length ? d.proximos.map((p) => (
            <Link key={p.id} href={`/tesoreria/pagos?id=${p.id}`} className="tes-tarea tes-dash-fila-link">
              <span className="pill warning">{fechaSinAnio(p.fecha)}</span>
              <div><strong>{p.concepto}</strong><small>{[p.item, p.medioPago].filter(Boolean).join(" · ")}</small></div>
              <TipoPago tipo={p.tipo} />
              <Dinero valor={p.valor} texto={p.valorTexto} fuerte />
            </Link>
          )) : <div className="empty">No hay pagos pendientes en los próximos 7 días.</div>}
        </div>
      </div>
    </div>
  );
}

function Barra({ nombre, n, total, color, detalle = null }) {
  const pct = total ? (n / total) * 100 : 0;
  return (
    <div className="estado-row">
      <div className="name">{nombre}</div>
      <div className="track"><div className="fill" style={{ width: `${pct}%`, background: color }} /></div>
      <div className="figs"><span className="n">{n.toLocaleString("es-CO")} · {Math.round(pct)}%</span>{detalle && <span className="c">{detalle}</span>}</div>
    </div>
  );
}

// ¿Alcanza la plata? Por cada cuenta: saldo de hoy (real o estimado) − lo que vence en el período con esa cuenta + lo que
// entra = saldo proyectado. Lo atrasado y los pagos con medios que no son una cuenta (tarjeta, efectivo, otra empresa)
// van aparte. Cifras de /api/tesoreria/proyeccion (lib/tesoreria/porResolver.js#proyeccionCaja).
function ProyeccionCaja() {
  const [periodo, setPeriodo] = useState("esta_semana");
  const [p, setP] = useState(null);
  useEffect(() => { setP(null); tesProyeccion(periodo).then(setP).catch(() => setP({ error: true })); }, [periodo]);
  return (
    <div className="card tes-proy" style={{ marginBottom: 14 }}>
      <div className="card-head">
        <div><h3>¿Alcanza la plata?</h3><p className="card-sub" style={{ margin: 0 }}>Saldo de hoy de cada cuenta frente a lo que vence {p?.periodo ? `(${p.periodo})` : ""} con esa cuenta.</p></div>
        <div className="dash-tabs" role="tablist" aria-label="Período">{[["esta_semana", "Esta semana"], ["proxima_semana", "Próxima"], ["este_mes", "Este mes"]].map(([k, t]) => <button key={k} type="button" role="tab" className="dash-tab" aria-selected={periodo === k} onClick={() => setPeriodo(k)}>{t}</button>)}</div>
      </div>
      {!p && <span className="spinner" />}
      {p?.error && <div className="empty compacta">No se pudo calcular la proyección.</div>}
      {p && !p.error && (
        <>
          <div className="tes-proy-grid">
            {p.cuentas.map((c) => (
              <div key={c.bancoId} className={`tes-proy-cta ${c.alcanza == null ? "nd" : c.alcanza ? (c.alcanzaConVencidos ? "ok" : "justo") : "mal"}`}>
                <div className="tes-proy-top"><strong>{c.banco}</strong>{c.alcanza == null ? <span className="pill muted">Sin saldo</span> : c.alcanza ? (c.alcanzaConVencidos ? <span className="pill good">Alcanza</span> : <span className="pill warning">Alcanza, sin lo atrasado</span>) : <span className="pill critical">No alcanza</span>}</div>
                <div className="tes-proy-eq">
                  <span>Hoy <b className="tes-num">{c.textos.saldoHoy}</b>{c.saldoHoy != null && !c.confirmado && <i> (estimado)</i>}</span>
                  <span>− vence <b className="tes-num tes-neg">{c.textos.sale}</b></span>
                  {c.entra > 0 && <span>+ entra <b className="tes-num tes-pos">{c.textos.entra}</b></span>}
                  <span className="tes-proy-res">= queda <b className="tes-num">{c.textos.proyectado}</b></span>
                </div>
                {c.vencido > 0 && <small>Además hay {c.textos.vencido} atrasados que se pagan con esta cuenta.</small>}
              </div>
            ))}
          </div>
          {p.otrosMedios.length > 0 && <p className="card-sub" style={{ margin: "10px 0 0" }}>Con otros medios (sin cuenta registrada): {p.otrosMedios.map((o) => `${o.medio}: vence ${o.textos.sale}${o.vencido ? ` + ${o.textos.vencido} atrasado` : ""}`).join(" · ")}.</p>}
        </>
      )}
    </div>
  );
}
