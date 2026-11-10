"use client";

import { useState } from "react";
import Link from "next/link";
import BarChartSvg from "@/components/charts/BarChartSvg";
import StackedBarChartSvg from "@/components/charts/StackedBarChartSvg";
import PieChartSvg from "@/components/charts/PieChartSvg";
import GaugeSvg from "@/components/charts/GaugeSvg";
import ExplicarProveedoresIA from "@/components/proveedores/ExplicarProveedoresIA";
import { saveBlob } from "@/lib/exportHelpers";
import { usePantallaNova } from "@/lib/novaPantalla";
import { fmtCOP } from "@/lib/format";
import { fmtFecha } from "@/lib/proveedoresOpciones";

const entero = (v) => String(Math.round(v));
const PDF = { navy: [12, 39, 72], blue: [27, 95, 184], ink: [11, 34, 57], muted: [100, 125, 151], good: [11, 107, 46], warn: [217, 119, 6], light: [79, 151, 232] };
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// Indicadores del módulo de proveedores, en diseño compacto y con los mismos componentes del
// dashboard de compras (KPIs, medidor, barras, apiladas y torta). Los datos llegan ya
// calculados desde lib/proveedoresCiclo.js#indicadoresCiclo. Se pueden exportar a Excel y PDF
// y explicar con IA (alertas, notificaciones y sugerencias).
export default function IndicadoresProveedores({ data }) {
  const { estados, clasificacion, criticidad } = data;
  usePantallaNova(
    `Pantalla Indicadores de proveedores, ciclo ${data.anio}: ${data.enCiclo} proveedores en el ciclo de ${data.total}, ${data.pctActualizado}% actualizados (${estados.actualizado} actualizados, ${estados.desactualizado} desactualizados, ${estados.en_proceso + estados.en_aprobacion} en trámite), ${data.criticos.pendientes} de ${data.criticos.total} críticos pendientes, ${data.checklistIncompleto} con checklist incompleto, ${data.diasParaCorte} días para el corte. Clasificación: Actualización ${clasificacion.actualizacion}, Nuevos ${clasificacion.nuevo}, Excepciones ${clasificacion.excepcion}, Inactivos ${clasificacion.inactivo}, Por registrar ${clasificacion.por_registrar || 0}. Gráficos: avance del ciclo, actualizaciones por mes, estado por área, clasificación, criticidad. Botones: Explicar con Nova, Excel, PDF.`
  );
  const [exportando, setExportando] = useState("");
  const [errorExport, setErrorExport] = useState("");

  async function exportarExcel() {
    setExportando("excel");
    setErrorExport("");
    try {
      const res = await fetch("/api/proveedores/indicadores/excel", { cache: "no-store" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "No se pudo generar el Excel.");
      saveBlob(`Indicadores_Proveedores_${data.anio}.xlsx`, await res.blob(), XLSX_MIME);
    } catch (err) {
      setErrorExport(err.message);
    } finally {
      setExportando("");
    }
  }

  async function exportarPdf() {
    setExportando("pdf");
    setErrorExport("");
    try {
      const { jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;
      const doc = new jsPDF({ unit: "pt", format: "letter" });
      const W = doc.internal.pageSize.getWidth();
      const H = doc.internal.pageSize.getHeight();
      const M = 40;
      const T = (v) => String(v ?? "").replace(/→/g, "->").replace(/[—–]/g, "-").replace(/[^\x00-\xFF]/g, "");

      doc.setFillColor(...PDF.navy); doc.rect(0, 0, W, 80, "F");
      doc.setFillColor(79, 151, 232); doc.rect(0, 80, W, 3, "F");
      doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(18);
      doc.text("Indicadores de proveedores", M, 40);
      doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(200, 215, 232);
      doc.text(T(`Ciclo ${data.anio}  ·  Generado el ${new Date().toLocaleDateString("es-CO")}`), M, 60);

      let y = 104;
      const kp = [[data.enCiclo, "Proveedores en el ciclo"], [`${data.pctActualizado}%`, "Actualizados"], [estados.desactualizado, "Por gestionar"], [data.criticos.pendientes, "Críticos pendientes"]];
      const bw = (W - 2 * M - 30) / 4;
      kp.forEach(([v, l], i) => {
        const x = M + i * (bw + 10);
        doc.setFillColor(241, 245, 250); doc.setDrawColor(219, 228, 238); doc.roundedRect(x, y, bw, 58, 7, 7, "FD");
        doc.setFillColor(...PDF.blue); doc.rect(x, y + 12, 3, 34, "F");
        doc.setTextColor(...PDF.navy); doc.setFont("helvetica", "bold"); doc.setFontSize(21); doc.text(String(v), x + bw / 2, y + 29, { align: "center" });
        doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...PDF.muted); doc.text(T(l), x + bw / 2, y + 45, { align: "center" });
      });
      y += 80;

      const base = { theme: "grid", styles: { font: "helvetica", fontSize: 8.5, cellPadding: 4.5, textColor: PDF.ink, lineColor: [226, 233, 241], lineWidth: 0.5 }, headStyles: { fillColor: PDF.navy, textColor: 255, fontStyle: "bold" }, alternateRowStyles: { fillColor: [247, 250, 253] }, margin: { left: M, right: M, top: 50, bottom: 40 } };
      const titulo = (t) => {
        if (y > H - 120) { doc.addPage(); y = 54; }
        doc.setFont("helvetica", "bold"); doc.setFontSize(12.5); doc.setTextColor(...PDF.navy); doc.text(T(t), M, y); y += 8;
      };
      const half = (W - 2 * M - 16) / 2;
      const num = { 1: { halign: "right", fontStyle: "bold" } };

      titulo("Resumen del ciclo");
      autoTable(doc, { ...base, startY: y, tableWidth: half, margin: { ...base.margin, right: W - M - half }, head: [["Clasificación", "Proveedores"]], columnStyles: num,
        body: [["Actualización", clasificacion.actualizacion], ["Nuevos", clasificacion.nuevo], ["Excepciones", clasificacion.excepcion], ["Inactivos", clasificacion.inactivo], ["Por registrar", clasificacion.por_registrar || 0]].map((r) => r.map(T)) });
      const y1 = doc.lastAutoTable.finalY;
      autoTable(doc, { ...base, startY: y, tableWidth: half, margin: { ...base.margin, left: M + half + 16 }, head: [["Estado del ciclo", "Proveedores"]], columnStyles: num,
        body: [["Actualizado", estados.actualizado], ["En aprobación", estados.en_aprobacion], ["En proceso", estados.en_proceso], ["Desactualizado", estados.desactualizado], ["Checklist incompleto", data.checklistIncompleto]].map((r) => r.map(T)) });
      y = Math.max(y1, doc.lastAutoTable.finalY) + 26;

      titulo("Actualizaciones por mes");
      const ch = 120;
      const maxM = Math.max(1, ...data.porMes.map((m) => m.value));
      const g = (W - 2 * M) / data.porMes.length;
      data.porMes.forEach((m, i) => {
        const h = (m.value / maxM) * (ch - 30);
        const x = M + g * i + g / 2 - 11;
        doc.setFillColor(...PDF.light); doc.rect(x, y + ch - 18 - h, 22, h, "F");
        doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...PDF.ink);
        if (m.value) doc.text(String(m.value), x + 11, y + ch - 21 - h, { align: "center" });
        doc.text(T(m.label), x + 11, y + ch - 6, { align: "center" });
      });
      y += ch + 14;

      titulo("Estado por área");
      const areas = data.areas.slice(0, 8);
      const maxA = Math.max(1, ...areas.map((a) => a.actualizado + a.aprobacion + a.sinActualizar));
      if (y + areas.length * 20 > H - 60) { doc.addPage(); y = 54; }
      areas.forEach((a, i) => {
        const yy = y + i * 20;
        let x = M + 130;
        doc.setFontSize(8); doc.setTextColor(...PDF.ink); doc.text(T(a.area).slice(0, 24), M, yy + 10);
        [[a.actualizado, PDF.good], [a.aprobacion, PDF.blue], [a.sinActualizar, PDF.warn]].forEach(([v, col]) => {
          const w = (v / maxA) * (W - 2 * M - 170);
          if (w > 0) { doc.setFillColor(...col); doc.rect(x, yy, w, 13, "F"); x += w; }
        });
        doc.text(String(a.actualizado + a.aprobacion + a.sinActualizar), x + 6, yy + 10);
      });
      y += areas.length * 20 + 6;
      doc.setFontSize(7.5); doc.setTextColor(...PDF.muted); doc.text("Verde: actualizado · Azul: en trámite · Naranja: desactualizado", M, y + 8);
      y += 26;

      titulo(`Críticos que requieren atención (${data.atencion.length})`);
      autoTable(doc, { ...base, startY: y, head: [["Proveedor", "NIT", "Área", "Estado"]],
        body: (data.atencion.length ? data.atencion.map((p) => [p.nombre, p.nit, p.area || "-", p.estadoLabel]) : [["No hay críticos pendientes", "", "", ""]]).map((r) => r.map(T)) });
      y = doc.lastAutoTable.finalY + 26;

      titulo("Compras con proveedores en alerta");
      autoTable(doc, { ...base, startY: y, head: [["Proveedor", "Compras", "Valor"]], columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
        body: (data.comprasConAlerta.top.length ? data.comprasConAlerta.top.map((p) => [p.nombre, p.registros, `$ ${Math.round(p.valor).toLocaleString("es-CO")}`]) : [["Sin compras en alerta", "", ""]]).map((r) => r.map(T)) });

      const total = doc.getNumberOfPages();
      for (let i = 1; i <= total; i++) {
        doc.setPage(i); doc.setDrawColor(219, 228, 238); doc.line(M, H - 32, W - M, H - 32);
        doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...PDF.muted);
        doc.text(T(`Sincosoft SAS · Gestión de Proveedores · Indicadores ciclo ${data.anio}`), M, H - 20);
        doc.text(`Página ${i} de ${total}`, W - M, H - 20, { align: "right" });
      }
      doc.save(`Indicadores_Proveedores_${data.anio}.pdf`);
    } catch (err) {
      setErrorExport(err.message || "No se pudo generar el PDF.");
    } finally {
      setExportando("");
    }
  }

  const filasEstado = [
    { nombre: "Actualizado", valor: estados.actualizado, color: "var(--good)" },
    { nombre: "En aprobación", valor: estados.en_aprobacion, color: "var(--secondary)" },
    { nombre: "En proceso", valor: estados.en_proceso, color: "var(--accent)" },
    { nombre: "Desactualizado", valor: estados.desactualizado, color: "var(--warning)" },
  ];

  const seriesAreas = ["Actualizado", "En proceso / aprobación", "Desactualizado"];
  const areasApiladas = data.areas.slice(0, 8).map((a) => ({
    key: a.area,
    label: a.area.length > 12 ? `${a.area.slice(0, 11)}…` : a.area,
    segments: [
      { name: seriesAreas[0], value: a.actualizado },
      { name: seriesAreas[1], value: a.aprobacion },
      { name: seriesAreas[2], value: a.sinActualizar },
    ],
  }));

  const tortaClasificacion = [
    { name: "Actualización", value: clasificacion.actualizacion },
    { name: "Nuevos", value: clasificacion.nuevo },
    { name: "Excepciones", value: clasificacion.excepcion },
    { name: "Inactivos", value: clasificacion.inactivo },
    { name: "Por registrar", value: clasificacion.por_registrar || 0 },
  ];
  const tortaCriticidad = [
    { name: "Crítico", value: criticidad.Critico || 0 },
    { name: "No crítico", value: criticidad["No crítico"] || 0 },
    { name: "Sin definir", value: criticidad["Sin definir"] || 0 },
  ];

  const compras = data.comprasConAlerta;

  return (
    <div className="prov-indicadores prov-compact">
      <div className="prov-toolbar-ind">
        <ExplicarProveedoresIA />
        <button type="button" className="btn" onClick={exportarExcel} disabled={!!exportando}>{exportando === "excel" ? <span className="spinner" /> : null} Excel</button>
        <button type="button" className="btn btn-primary" onClick={exportarPdf} disabled={!!exportando}>{exportando === "pdf" ? <span className="spinner" /> : null} Descargar PDF</button>
      </div>
      {errorExport && <div className="modal-error" role="alert">{errorExport}</div>}

      <section className="kpi-row" aria-label="Indicadores principales">
        <div className="kpi" style={{ "--kpi-c": "var(--accent)" }}>
          <div className="kpi-head"><div className="label">Proveedores en el ciclo</div></div>
          <div className="value">{data.enCiclo}</div>
          <div className="foot">de {data.total} · ciclo {data.anio}</div>
        </div>
        <div className="kpi" style={{ "--kpi-c": data.pctActualizado >= 80 ? "var(--good)" : data.pctActualizado >= 50 ? "var(--warning)" : "var(--critical)" }}>
          <div className="kpi-head"><div className="label">Actualizados</div></div>
          <div className="value">{data.pctActualizado}%</div>
          <div className="foot">{estados.actualizado} de {data.enCiclo}</div>
        </div>
        <div className="kpi" style={{ "--kpi-c": "var(--warning)" }}>
          <div className="kpi-head"><div className="label">Por gestionar</div></div>
          <div className="value">{estados.desactualizado}</div>
          <div className="foot">{estados.en_proceso + estados.en_aprobacion} en trámite · corte en {data.diasParaCorte} días</div>
        </div>
        <div className="kpi" style={{ "--kpi-c": "var(--critical)" }}>
          <div className="kpi-head"><div className="label">Críticos pendientes</div></div>
          <div className="value">{data.criticos.pendientes}</div>
          <div className="foot">de {data.criticos.total} críticos</div>
        </div>
      </section>

      <section className="kpi-row kpi-row-5" aria-label="Clasificación">
        <div className="kpi"><div className="label">Actualización</div><div className="value">{clasificacion.actualizacion}</div></div>
        <div className="kpi"><div className="label">Nuevos</div><div className="value">{clasificacion.nuevo}</div></div>
        <div className="kpi"><div className="label">Excepciones</div><div className="value">{clasificacion.excepcion}</div></div>
        <div className="kpi"><div className="label">Inactivos</div><div className="value">{clasificacion.inactivo}</div></div>
        <div className="kpi"><div className="label">Por registrar</div><div className="value">{clasificacion.por_registrar || 0}</div></div>
      </section>

      <div className="prov-grid-3">
        <div className="card">
          <h3>Avance del ciclo {data.anio}</h3>
          <p className="card-sub">Proveedores que ya quedaron actualizados.</p>
          <div className="gauge-wrap">
            <GaugeSvg percent={data.pctActualizado} />
            <div className="gauge-foot">{estados.actualizado} de {data.enCiclo} actualizados</div>
            <div className="gauge-breakdown" style={{ width: "100%" }}>
              {filasEstado.map((f) => (
                <div className="estado-row" key={f.nombre}>
                  <div className="name">{f.nombre}</div>
                  <div className="track"><div className="fill" style={{ width: `${data.enCiclo ? (f.valor / data.enCiclo) * 100 : 0}%`, background: f.color }} /></div>
                  <div className="figs"><span className="n">{f.valor}</span></div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <h3>Resumen ejecutivo</h3>
          <div className="summary-grid">
            <div className="detail-item">
              <div className="dlabel">Días para el corte</div>
              <div className="dvalue">{data.diasParaCorte}</div>
              <div className="dcap">Luego todos pasan a Desactualizado</div>
            </div>
            <div className="detail-item">
              <div className="dlabel">Checklist incompleto</div>
              <div className="dvalue">{data.checklistIncompleto}</div>
              <div className="dcap">Con documentos pendientes</div>
            </div>
            <div className="detail-item">
              <div className="dlabel">Compras con proveedor en alerta</div>
              <div className="dvalue">{compras.registros}</div>
              <div className="dcap">{compras.registros ? `${fmtCOP(compras.valor)} · ${compras.proveedores} proveedor(es)` : "Sin compras en el ciclo"}</div>
            </div>
            <div className="detail-item">
              <div className="dlabel">Ciclo {data.proximoCiclo.anio}</div>
              <div className="dvalue">{data.proximoCiclo.desactualizados}</div>
              <div className="dcap">Pasarán a Desactualizado el 1 de abril</div>
            </div>
          </div>
        </div>

        <div className="card">
          <h3>Actualizaciones por mes</h3>
          <p className="card-sub">Proveedores actualizados en cada mes del ciclo.</p>
          <BarChartSvg data={data.porMes} formatValue={entero} />
        </div>
      </div>

      <div className="prov-grid-3">
        <div className="card span-2">
          <h3>Estado por área</h3>
          <p className="card-sub">Proveedores de Actualización, las 8 áreas con más proveedores.</p>
          <StackedBarChartSvg data={areasApiladas} seriesNames={seriesAreas} formatValue={entero} />
        </div>
        <div className="card">
          <h3>Clasificación</h3>
          <p className="card-sub">Los {data.total} proveedores del maestro.</p>
          <PieChartSvg data={tortaClasificacion} formatValue={entero} />
        </div>
      </div>

      <div className="prov-grid-3">
        <div className="card">
          <h3>Criticidad</h3>
          <p className="card-sub">Activos del ciclo, sin excepciones ni inactivos.</p>
          <PieChartSvg data={tortaCriticidad} formatValue={entero} />
        </div>
        <div className="card">
          <h3>Críticos que requieren atención</h3>
          {data.atencion.length === 0 ? (
            <div className="empty">No hay críticos pendientes.</div>
          ) : (
            <div className="prov-scroll">
              <table className="prov-table">
                <thead><tr><th scope="col">Proveedor</th><th scope="col">Estado</th><th scope="col">Últ. actualización</th></tr></thead>
                <tbody>
                  {data.atencion.map((p) => (
                    <tr key={p.id}><td><strong>{p.nombre}</strong><div className="mono muted">{p.area || p.nit}</div></td><td>{p.estadoLabel}</td><td className="mono">{fmtFecha(p.fechaActualizacion)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="prov-note"><Link href="/proveedores">Ir a gestión</Link></p>
        </div>
        <div className="card">
          <h3>Compras con proveedores en alerta</h3>
          {compras.top.length === 0 ? (
            <div className="empty">No hay compras con proveedores en alerta.</div>
          ) : (
            <div className="prov-scroll">
              <table className="prov-table">
                <thead><tr><th scope="col">Proveedor</th><th scope="col">Compras</th><th scope="col">Valor</th></tr></thead>
                <tbody>
                  {compras.top.map((p) => (
                    <tr key={p.nombre}><td><strong>{p.nombre}</strong></td><td className="mono">{p.registros}</td><td className="mono">{fmtCOP(p.valor)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
