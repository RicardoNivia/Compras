"use client";

import { useEffect, useState } from "react";
import { fetchInformeMensual, reviewInformeProveedoresApi } from "@/lib/api";
import { saveBlob } from "@/lib/exportHelpers";
import { usePantallaNova } from "@/lib/novaPantalla";
import ExplicarProveedoresIA from "@/components/proveedores/ExplicarProveedoresIA";
import { BarGradient, roundedTop, stagger, tween, useMorph, useProgress, useReveal, useUid } from "@/components/charts/chartKit";

const COLOR = { activo: "var(--good)", pendiente: "var(--warning)", inactivo: "var(--critical)" };
const PDF = { navy: [12, 39, 72], blue: [27, 95, 184], ink: [11, 34, 57], muted: [100, 125, 151], activo: [11, 107, 46], pendiente: [217, 119, 6], inactivo: [185, 28, 28], nuevo: [27, 95, 184], act: [79, 151, 232] };

// Barras agrupadas: nuevos vs actualizados de los últimos 6 meses.
function TendenciaChart({ data }) {
  const [hover, setHover] = useState(null);
  const [ref, shown] = useReveal();
  const uid = useUid();
  const p = useProgress(shown);
  const vals = useMorph(data.flatMap((d) => [d.nuevos, d.actualizados]));
  const W = 1200, H = 210, P = { l: 44, r: 20, t: 26, b: 32 };
  const max = Math.max(1, ...vals);
  const innerW = W - P.l - P.r, innerH = H - P.t - P.b, grupo = innerW / data.length, bw = Math.min(46, grupo / 3.2);
  const y = (v) => P.t + innerH - (v / max) * innerH;
  return (
    <svg ref={ref} className="prov-tendencia-svg cx" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Tendencia: ${data.map((d) => `${d.label} ${d.nuevos} nuevos y ${d.actualizados} actualizados`).join("; ")}`}>
      <defs>
        <BarGradient id={`${uid}n`} color="var(--accent)" top={1} bottom={0.65} />
        <BarGradient id={`${uid}a`} color="var(--secondary)" top={1} bottom={0.65} />
      </defs>
      {[0, 1, 2, 3, 4].map((i) => {
        const v = (max / 4) * i;
        return (<g key={i} style={{ opacity: Math.min(1, p * 3) }}><line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} stroke="var(--grid)" strokeDasharray={i === 0 ? undefined : "3 5"} /><text x={P.l - 6} y={y(v) + 4} textAnchor="end" fontSize="13" fill="var(--muted)">{Math.round(v)}</text></g>);
      })}
      {data.map((d, i) => {
        const cx = P.l + grupo * i + grupo / 2;
        const t = stagger(p, i, data.length);
        const base = P.t + innerH;
        const vn = vals[i * 2] ?? 0, va = vals[i * 2 + 1] ?? 0;
        const hn = (base - y(vn)) * t, ha = (base - y(va)) * t;
        const atenuado = hover != null && hover !== i;
        return (
          <g key={d.key} style={{ opacity: atenuado ? 0.4 : 1, transition: "opacity .2s ease" }} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <rect x={cx - grupo / 2 + 4} y={P.t - 8} width={grupo - 8} height={innerH + 8} rx="10" fill="var(--accent)" className="cx-band" style={{ opacity: hover === i ? 0.07 : 0 }} />
            <path className="cx-bar" d={roundedTop(cx - bw - 2, base - hn, bw, hn, 6)} fill={`url(#${uid}n)`} style={{ filter: hover === i ? "drop-shadow(0 5px 8px color-mix(in srgb, var(--accent) 40%, transparent))" : "none" }}><title>{`${d.label}: ${d.nuevos} nuevos`}</title></path>
            <path className="cx-bar" d={roundedTop(cx + 2, base - ha, bw, ha, 6)} fill={`url(#${uid}a)`} style={{ filter: hover === i ? "drop-shadow(0 5px 8px color-mix(in srgb, var(--secondary) 40%, transparent))" : "none" }}><title>{`${d.label}: ${d.actualizados} actualizados`}</title></path>
            {d.nuevos > 0 && <text x={cx - bw / 2 - 2} y={base - hn - 5} textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--ink)" style={{ opacity: Math.max(0, (t - 0.45) / 0.55) }}>{tween(Math.round(vn), t)}</text>}
            {d.actualizados > 0 && <text x={cx + bw / 2 + 2} y={base - ha - 5} textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--ink)" style={{ opacity: Math.max(0, (t - 0.45) / 0.55) }}>{tween(Math.round(va), t)}</text>}
            <text x={cx} y={H - 9} textAnchor="middle" fontSize="14" fontWeight={d.actual ? 700 : 400} fill="var(--ink)">{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

// Barras horizontales apiladas: activos / pendientes / inactivos de nuevos y actualizados.
function EstadoChart({ filas }) {
  const max = Math.max(1, ...filas.map((f) => f.total));
  return (
    <div className="prov-hstack">
      {filas.map((f) => (
        <div className="prov-hstack-row" key={f.label}>
          <span className="prov-hstack-label">{f.label}</span>
          <span className="prov-hstack-bar" style={{ width: `${(f.total / max) * 100}%` }}>
            {["activo", "pendiente", "inactivo"].map((k) => f.conteo[k] > 0 && (
              <span key={k} style={{ flex: f.conteo[k], background: COLOR[k] }} title={`${f.label}: ${f.conteo[k]} ${k}s`}>{f.conteo[k]}</span>
            ))}
          </span>
        </div>
      ))}
      <div className="prov-hstack-legend">
        <span><i style={{ background: COLOR.activo }} />Activos</span>
        <span><i style={{ background: COLOR.pendiente }} />Pendientes</span>
        <span><i style={{ background: COLOR.inactivo }} />Inactivos</span>
      </div>
    </div>
  );
}

function AreaChart({ areas }) {
  const max = Math.max(1, ...areas.map((a) => a.cantidad));
  return (
    <div className="prov-hstack">
      {areas.map((a) => (
        <div className="prov-hstack-row" key={a.area}>
          <span className="prov-hstack-label">{a.area}</span>
          <span className="prov-hstack-bar" style={{ width: `${(a.cantidad / max) * 100}%` }}>
            <span style={{ flex: 1, background: "var(--secondary)" }}>{a.cantidad}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function LineaEstados({ c }) {
  return (
    <div className="prov-stline">
      <span><i style={{ background: COLOR.activo }} />{c.activo} activos</span>
      <span><i style={{ background: COLOR.pendiente }} />{c.pendiente} pendientes</span>
      <span><i style={{ background: COLOR.inactivo }} />{c.inactivo} inactivos</span>
    </div>
  );
}

function ListaMini({ filas, vacio }) {
  if (!filas.length) return <div className="empty">{vacio}</div>;
  return (
    <ul className="prov-mini">
      {filas.slice(0, 6).map((r) => <li key={r.id}><span>{r.nombre}</span><small>{r.fecha} · {r.estado}</small></li>)}
      {filas.length > 6 && <li className="more">y {filas.length - 6} más</li>}
    </ul>
  );
}

// Informe mensual de proveedores — mismo concepto del informe de la página original: nuevos,
// actualizados y excepciones del mes, tendencia, gestión en la app y situación actual.
export default function InformeMensual({ initial = null }) {
  const [anio, setAnio] = useState(initial?.anio ?? null);
  const [mes, setMes] = useState(initial?.mes ?? null);
  const [data, setData] = useState(initial);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(!initial);
  const [exportando, setExportando] = useState("");
  usePantallaNova(
    data
      ? `Pantalla Informe mensual de proveedores, mes ${data.titulo}: ${data.kpis.nuevos} proveedores nuevos, ${data.kpis.actualizados} actualizados, ${data.kpis.cambios} cambios hechos en la app, ${data.kpis.pasadosAprobado} pasados a Actualizado; ${data.excepciones.length} excepciones con fecha en el mes. Situación actual: ${data.situacion.registrados} registrados, ${data.situacion.aprobados} aprobados, ${data.situacion.aptos} aptos para orden de compra, ${data.situacion.pendientes} pendientes, ${data.situacion.inactivos} inactivos. Muestra tendencia de 6 meses, estado y movimiento por área, listas del mes y botones Excel y PDF.`
      : "Pantalla Informe mensual de proveedores (cargando)."
  );

  useEffect(() => {
    if (initial && anio === initial.anio && mes === initial.mes) return;
    let cancelado = false;
    setCargando(true);
    fetchInformeMensual(anio ?? undefined, mes ?? undefined)
      .then((d) => { if (!cancelado) { setData(d); setAnio(d.anio); setMes(d.mes); setError(""); } })
      .catch((err) => { if (!cancelado) setError(err.message || "No se pudo cargar el informe."); })
      .finally(() => { if (!cancelado) setCargando(false); });
    return () => { cancelado = true; };
  }, [anio, mes]);

  async function exportarExcel() {
    setExportando("excel");
    setError("");
    try {
      const res = await fetch(`/api/proveedores/informe/excel?anio=${data.anio}&mes=${data.mes}`, { cache: "no-store" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "No se pudo generar el Excel.");
      saveBlob(`Informe_Mensual_Proveedores_${data.anio}-${String(data.mes).padStart(2, "0")}.xlsx`, await res.blob(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    } catch (err) {
      setError(err.message);
    } finally {
      setExportando("");
    }
  }

  async function exportarPdf() {
    setExportando("pdf");
    try {
      const { jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;
      const doc = new jsPDF({ unit: "pt", format: "letter" });
      const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 40;
      const T = (s) => String(s ?? "").replace(/→/g, "->").replace(/[—–]/g, "-").replace(/[^\x00-\xFF]/g, "");
      const d = data;
      doc.setFillColor(...PDF.navy); doc.rect(0, 0, W, 88, "F");
      doc.setFillColor(79, 151, 232); doc.rect(0, 88, W, 3, "F");
      doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(18);
      doc.text("Informe mensual de proveedores", M, 43);
      doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(200, 215, 232);
      doc.text(T(`${d.titulo}  ·  Generado el ${new Date().toLocaleDateString("es-CO")}`), M, 62);

      let y = 112;
      const kp = [[d.kpis.nuevos, "Proveedores nuevos"], [d.kpis.actualizados, "Proveedores actualizados"], [d.kpis.cambios, "Cambios en la app"], [d.kpis.pasadosAprobado, "Pasados a Actualizado"]];
      const bw = (W - 2 * M - 30) / 4;
      kp.forEach(([v, l], i) => {
        const x = M + i * (bw + 10);
        doc.setFillColor(241, 245, 250); doc.setDrawColor(219, 228, 238); doc.roundedRect(x, y, bw, 60, 7, 7, "FD");
        doc.setFillColor(...PDF.blue); doc.rect(x, y + 12, 3, 36, "F");
        doc.setTextColor(...PDF.navy); doc.setFont("helvetica", "bold"); doc.setFontSize(22); doc.text(String(v), x + bw / 2, y + 30, { align: "center" });
        doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...PDF.muted); doc.text(l, x + bw / 2, y + 47, { align: "center" });
      });
      y += 84;

      const base = { theme: "grid", styles: { font: "helvetica", fontSize: 8.3, cellPadding: 4.5, textColor: PDF.ink, lineColor: [226, 233, 241], lineWidth: 0.5 }, headStyles: { fillColor: PDF.navy, textColor: 255, fontStyle: "bold" }, alternateRowStyles: { fillColor: [247, 250, 253] }, margin: { left: M, right: M, top: 50, bottom: 40 } };
      const seccion = (titulo) => {
        if (y > H - 130) { doc.addPage(); y = 54; }
        doc.setFont("helvetica", "bold"); doc.setFontSize(12.5); doc.setTextColor(...PDF.navy); doc.text(T(titulo), M, y); y += 9;
      };
      const despues = () => { y = doc.lastAutoTable.finalY + 26; };
      const vacio = (msg) => { doc.setFont("helvetica", "italic"); doc.setFontSize(9); doc.setTextColor(...PDF.muted); doc.text(T(msg), M, y + 8); y += 30; };

      seccion("Resumen del mes");
      const half = (W - 2 * M - 16) / 2;
      const nc = { 1: { halign: "right", cellWidth: 70, fontStyle: "bold" } };
      const en = d.estadoNuevos, ea = d.estadoActualizados;
      autoTable(doc, { ...base, startY: y, tableWidth: half, margin: { ...base.margin, right: W - M - half }, head: [["Movimiento del mes", "Cant."]], columnStyles: nc,
        body: [["Proveedores nuevos", d.kpis.nuevos], ["   Activos / pendientes / inactivos", `${en.activo} / ${en.pendiente} / ${en.inactivo}`], ["Proveedores actualizados", d.kpis.actualizados], ["   Activos / pendientes / inactivos", `${ea.activo} / ${ea.pendiente} / ${ea.inactivo}`], ["Excepciones con fecha en el mes", d.excepciones.length], ["Cambios hechos en la app", d.kpis.cambios], ["Proveedores con cambios", d.gestion.proveedoresConCambios], ["Radicaciones de facturas marcadas", d.gestion.radicaciones]].map((r) => r.map(T)) });
      const y1 = doc.lastAutoTable.finalY;
      autoTable(doc, { ...base, startY: y, tableWidth: half, margin: { ...base.margin, left: M + half + 16 }, head: [["Situación actual", "Cant."]], columnStyles: nc,
        body: [["Proveedores registrados", d.situacion.registrados], ["Aprobados con checklist", d.situacion.aprobados], ["Aptos para orden de compra", d.situacion.aptos], ["Pendientes", d.situacion.pendientes], ["Inactivos", d.situacion.inactivos], ["Excepciones facturando", d.situacion.facturando]].map((r) => r.map(T)) });
      y = Math.max(y1, doc.lastAutoTable.finalY) + 28;

      // Gráficos dibujados (barras)
      seccion("Gráficos del mes");
      if (y + 190 > H - 50) { doc.addPage(); y = 54; }
      const card = (x, yy, w, h, titulo) => { doc.setFillColor(255, 255, 255); doc.setDrawColor(219, 228, 238); doc.roundedRect(x, yy, w, h, 7, 7, "FD"); doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(...PDF.navy); doc.text(T(titulo), x + 12, yy + 17); };
      const cw = W - 2 * M, ch = 150;
      card(M, y, cw, ch, "Tendencia de los últimos 6 meses: nuevos y actualizados");
      const maxT = Math.max(1, ...d.tendencia.flatMap((t) => [t.nuevos, t.actualizados]));
      const base0 = y + ch - 24, alto = ch - 62, g = (cw - 40) / d.tendencia.length;
      d.tendencia.forEach((t, i) => {
        const cx = M + 20 + g * i + g / 2;
        [[t.nuevos, PDF.nuevo, -17], [t.actualizados, PDF.act, 3]].forEach(([v, col, dx]) => {
          const h = (v / maxT) * alto; doc.setFillColor(...col); doc.rect(cx + dx, base0 - h, 14, h, "F");
          if (v) { doc.setFontSize(7.5); doc.setTextColor(...PDF.ink); doc.text(String(v), cx + dx + 7, base0 - h - 3, { align: "center" }); }
        });
        doc.setFontSize(8); doc.setTextColor(...PDF.ink); doc.text(T(t.label), cx, base0 + 13, { align: "center" });
      });
      y += ch + 12;
      const hw = (W - 2 * M - 12) / 2, hh = 120;
      if (y + hh > H - 50) { doc.addPage(); y = 54; }
      card(M, y, hw, hh, "Estado de nuevos y actualizados");
      card(M + hw + 12, y, hw, hh, "Movimiento del mes por área");
      const filasE = [["Nuevos", en], ["Actualizados", ea]].map(([l, c]) => ({ l, c, t: c.activo + c.pendiente + c.inactivo })).filter((f) => f.t);
      if (!filasE.length) { doc.setFont("helvetica", "italic"); doc.setFontSize(9); doc.setTextColor(...PDF.muted); doc.text("Sin movimiento en el mes", M + 12, y + 44); }
      const maxE = Math.max(1, ...filasE.map((f) => f.t));
      filasE.forEach((f, i) => {
        const yy = y + 34 + i * 28; let x = M + 78; doc.setFontSize(8); doc.setTextColor(...PDF.ink); doc.text(f.l, M + 12, yy + 9);
        ["activo", "pendiente", "inactivo"].forEach((k) => { const w = (f.c[k] / maxE) * (hw - 110); if (w > 0) { doc.setFillColor(...PDF[k]); doc.rect(x, yy, w, 12, "F"); x += w; } });
      });
      if (!d.areas.length) { doc.setFont("helvetica", "italic"); doc.setFontSize(9); doc.setTextColor(...PDF.muted); doc.text("Sin movimiento en el mes", M + hw + 24, y + 44); }
      const maxA = Math.max(1, ...d.areas.map((a) => a.cantidad));
      d.areas.forEach((a, i) => {
        const yy = y + 30 + i * 17; doc.setFontSize(7.5); doc.setTextColor(...PDF.ink); doc.text(T(a.area).slice(0, 18), M + hw + 24, yy + 8);
        doc.setFillColor(...PDF.act); doc.rect(M + hw + 100, yy, (a.cantidad / maxA) * (hw - 130), 10, "F"); doc.text(String(a.cantidad), M + hw + 104 + (a.cantidad / maxA) * (hw - 130), yy + 8);
      });
      y += hh + 28;

      const cab = [["Razón social", "NIT", "Fecha", "Estado", "Criticidad", "Área", "Apto OC"]];
      const cuerpo = (l) => l.map((r) => [r.nombre, r.nit, r.fecha, r.estado, r.criticidad, r.area, r.apto ? "Sí" : "No"].map(T));
      const cols = { 0: { cellWidth: 150, fontStyle: "bold" }, 1: { cellWidth: 70 }, 2: { cellWidth: 52 }, 6: { cellWidth: 42, halign: "center" } };
      const lista = (titulo, filas, msg) => {
        seccion(`${titulo} (${filas.length})`);
        if (!filas.length) return vacio(msg);
        autoTable(doc, { ...base, startY: y, head: cab, body: cuerpo(filas), columnStyles: cols }); despues();
      };
      lista("Proveedores nuevos del mes", d.nuevos, `No hay proveedores nuevos con fecha en ${d.titulo}.`);
      lista("Proveedores actualizados del mes", d.actualizados, `No hay proveedores actualizados con fecha en ${d.titulo}.`);
      if (d.excepciones.length) lista("Excepciones con fecha en el mes", d.excepciones, "");
      seccion(`Cambios realizados en la app (${d.historial.length})`);
      if (!d.historial.length) vacio(`No se registraron cambios en la app en ${d.titulo}.`);
      else { autoTable(doc, { ...base, startY: y, head: [["Fecha", "Hora", "Proveedor", "Detalle"]], columnStyles: { 0: { cellWidth: 58 }, 1: { cellWidth: 36 }, 2: { cellWidth: 150, fontStyle: "bold" } }, body: d.historial.map((h) => [h.fecha, h.hora, h.proveedor, h.detalle].map(T)) }); despues(); }

      const n = doc.getNumberOfPages();
      for (let i = 1; i <= n; i++) {
        doc.setPage(i); doc.setDrawColor(219, 228, 238); doc.line(M, H - 32, W - M, H - 32);
        doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...PDF.muted);
        doc.text(T(`Sincosoft SAS · Gestión de Proveedores · Informe mensual ${d.titulo}`), M, H - 20);
        doc.text(`Página ${i} de ${n}`, W - M, H - 20, { align: "right" });
      }
      doc.save(`Informe_Mensual_Proveedores_${d.anio}-${String(d.mes).padStart(2, "0")}.pdf`);
    } catch (err) {
      setError(err.message || "No se pudo generar el PDF.");
    } finally {
      setExportando("");
    }
  }

  if (error && !data) return <div className="modal-error" role="alert">{error}</div>;
  if (!data) return <div style={{ padding: 24 }}><span className="spinner" /> Cargando informe…</div>;

  const filasEstado = [{ label: "Nuevos", conteo: data.estadoNuevos, total: data.kpis.nuevos }, { label: "Actualizados", conteo: data.estadoActualizados, total: data.kpis.actualizados }].filter((f) => f.total);
  const s = data.situacion;

  return (
    <div className="prov-informe prov-compact">
      <div className="toolbar" style={{ alignItems: "flex-end" }}>
        <div className="field">
          <label htmlFor="inf-anio">Año</label>
          <select id="inf-anio" value={data.anio} onChange={(e) => setAnio(Number(e.target.value))}>
            {data.aniosDisponibles.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="inf-mes">Mes del informe</label>
          <select id="inf-mes" value={data.mes} onChange={(e) => setMes(Number(e.target.value))}>
            {data.meses.map((m, i) => <option key={m} value={i + 1}>{m[0].toUpperCase() + m.slice(1)}</option>)}
          </select>
        </div>
        {cargando && <span className="spinner" aria-label="Cargando" />}
        <div className="spacer" />
        <ExplicarProveedoresIA
          clave={`${data.anio}-${data.mes}`}
          analizar={() => reviewInformeProveedoresApi(data.anio, data.mes)}
          titulo={`Análisis del informe de ${data.titulo}`}
          subtitulo="Resumen, alertas y sugerencias sobre el movimiento de proveedores del mes"
          cargando="Analizando el informe del mes…"
        />
        <button type="button" className="btn" onClick={exportarExcel} disabled={!!exportando}>{exportando === "excel" ? <span className="spinner" /> : null} Excel</button>
        <button type="button" className="btn btn-primary" onClick={exportarPdf} disabled={!!exportando}>{exportando === "pdf" ? <span className="spinner" /> : null} Descargar PDF</button>
      </div>
      {error && <div className="modal-error" role="alert">{error}</div>}

      <h3 className="prov-informe-title">{data.titulo}</h3>
      <section className="kpi-row" aria-label="Resumen del mes">
        <div className="kpi" style={{ "--kpi-c": "var(--accent)" }}><div className="kpi-head"><div className="label">Proveedores nuevos</div></div><div className="value">{data.kpis.nuevos}</div></div>
        <div className="kpi" style={{ "--kpi-c": "var(--secondary)" }}><div className="kpi-head"><div className="label">Proveedores actualizados</div></div><div className="value">{data.kpis.actualizados}</div></div>
        <div className="kpi" style={{ "--kpi-c": "var(--warning)" }}><div className="kpi-head"><div className="label">Cambios hechos en la app</div></div><div className="value">{data.kpis.cambios}</div></div>
        <div className="kpi" style={{ "--kpi-c": "var(--good)" }}><div className="kpi-head"><div className="label">Pasados a Actualizado</div></div><div className="value">{data.kpis.pasadosAprobado}</div></div>
      </section>

      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <h3>Tendencia de los últimos 6 meses</h3>
          <div style={{ display: "flex", gap: 12, fontSize: 12 }}>
            <span><span className="prov-swatch" style={{ background: "var(--accent)" }} />Nuevos</span>
            <span><span className="prov-swatch" style={{ background: "var(--secondary)" }} />Actualizados</span>
          </div>
        </div>
        <div className="chart-wrap"><TendenciaChart data={data.tendencia} /></div>
      </div>

      <div className="prov-grid-2">
        <div className="card">
          <h3>Estado de nuevos y actualizados</h3>
          {filasEstado.length ? <EstadoChart filas={filasEstado} /> : <div className="empty">Sin movimiento en el mes</div>}
        </div>
        <div className="card">
          <h3>Movimiento del mes por área</h3>
          {data.areas.length ? <AreaChart areas={data.areas} /> : <div className="empty">Sin movimiento en el mes</div>}
        </div>
      </div>

      <div className="prov-grid-3">
        <div className="card">
          <h3>Nuevos proveedores del mes</h3>
          {data.nuevos.length > 0 && <LineaEstados c={data.estadoNuevos} />}
          <ListaMini filas={data.nuevos} vacio="No hay proveedores nuevos con fecha en este mes." />
        </div>
        <div className="card">
          <h3>Proveedores actualizados del mes</h3>
          {data.actualizados.length > 0 && <LineaEstados c={data.estadoActualizados} />}
          <ListaMini filas={data.actualizados} vacio="No hay proveedores actualizados con fecha en este mes." />
        </div>
        <div className="card">
          <h3>Excepciones del mes</h3>
          <ListaMini filas={data.excepciones} vacio="No hay excepciones con fecha en este mes." />
        </div>
      </div>

      <div className="prov-grid-2">
        <div className="card">
          <h3>Situación actual</h3>
          <p className="card-sub">Al generar el informe.</p>
          <div className="summary-grid" style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))" }}>
            {[["Registrados", s.registrados], ["Aprobados con checklist", s.aprobados], ["Aptos para orden de compra", s.aptos], ["Pendientes", s.pendientes], ["Inactivos", s.inactivos], ["Excepciones facturando", s.facturando]].map(([l, v]) => (
              <div className="detail-item" key={l}><div className="dlabel">{l}</div><div className="dvalue">{v}</div></div>
            ))}
          </div>
        </div>
        <div className="card">
          <h3>Gestión en la app</h3>
          <ul className="prov-mini">
            <li><span>Proveedores con cambios</span><small>{data.gestion.proveedoresConCambios}</small></li>
            <li><span>Radicaciones de facturas marcadas</span><small>{data.gestion.radicaciones}</small></li>
            <li><span>Cargas de archivo / respaldos</span><small>{data.gestion.cargas}</small></li>
          </ul>
          <p className="prov-note">Descárgalo en PDF (para presentar o enviar) o en Excel (para trabajar los datos). Incluye: Resumen, Nuevos del mes, Actualizados del mes{data.excepciones.length ? ", Excepciones del mes" : ""} y el detalle de los cambios con fecha y hora.</p>
        </div>
      </div>
    </div>
  );
}
