"use client";

import { useMemo, useRef, useState } from "react";
import DetailModal from "@/components/DetailModal";
import BarChartSvg from "@/components/charts/BarChartSvg";
import StackedBarChartSvg from "@/components/charts/StackedBarChartSvg";
import HistogramSvg from "@/components/charts/HistogramSvg";
import CompliancePercentChartSvg from "@/components/charts/CompliancePercentChartSvg";
import PieChartSvg from "@/components/charts/PieChartSvg";
import GaugeSvg from "@/components/charts/GaugeSvg";
import { fmtCOP, fmtCompact, fmtNum, fmtPesos, fmtDateDisplay, monthKey, monthLabel } from "@/lib/format";
import { businessDaysBetween, businessDaysElapsedToToday } from "@/lib/businessDays";
import { getDiasInfo } from "@/lib/diasInfo";
import { IconFile, IconMoney, IconClock, IconAlert, IconTrendUp } from "@/components/icons";

const ESTADO_ORDER = ["Ejecutado", "Proceso", "Pendiente", "Anulado", "Sin estado"];
const SERIES_COLOR_VARS = ["--s1", "--s2", "--s3", "--s4", "--s5", "--sOther"];

function sum(arr, fn) {
  return arr.reduce((s, x) => s + (fn(x) || 0), 0);
}

function isAnulado(r) {
  return r.estado === "Anulado";
}

function estadoLabel(estado) {
  return estado && estado.trim() ? estado : "Sin estado";
}

function todayYearMonth() {
  const d = new Date();
  const year = String(d.getFullYear());
  const month = `${year}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  return { year, month };
}

export default function DashboardView({ records }) {
  const { year: currentYear, month: currentMonthKey } = todayYearMonth();

  const [viewMode, setViewMode] = useState("mensual"); // "mensual" | "anual"
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey);
  const [detailRecord, setDetailRecord] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const containerRef = useRef(null);

  function switchToAnual() {
    setViewMode("anual");
    setSelectedMonth("");
    setSelectedYear((y) => y || currentYear);
  }

  function switchToMensual() {
    setViewMode("mensual");
    setSelectedYear("");
    setSelectedMonth((m) => m || currentMonthKey);
  }

  // Años disponibles a partir de todos los registros (más el año actual, para que
  // la pestaña Anual siempre tenga un año válido seleccionado por defecto).
  const yearOptions = useMemo(() => {
    const set = new Set([currentYear]);
    for (const r of records) {
      const k = monthKey(r.fechaSolicitud);
      if (k) set.add(k.slice(0, 4));
    }
    return Array.from(set).sort().reverse();
  }, [records, currentYear]);

  function handleYearChange(year) {
    setSelectedYear(year);
  }

  // Pestaña Anual: se restringe al año elegido. Pestaña Mensual: sin restricción de
  // año (el mes YYYY-MM ya es específico), así el selector de mes lista todos los meses.
  const yearFilteredRecords = useMemo(() => {
    if (!selectedYear) return records;
    return records.filter((r) => (monthKey(r.fechaSolicitud) || "").startsWith(selectedYear));
  }, [records, selectedYear]);

  const monthOptions = useMemo(() => {
    const set = new Set(viewMode === "mensual" ? [currentMonthKey] : []);
    for (const r of yearFilteredRecords) {
      const k = monthKey(r.fechaSolicitud);
      if (k) set.add(k);
    }
    return Array.from(set).sort().reverse();
  }, [yearFilteredRecords, viewMode, currentMonthKey]);

  const multiYear = useMemo(() => {
    const years = new Set(monthOptions.map((k) => k.slice(0, 4)));
    return years.size > 1;
  }, [monthOptions]);

  const allMonthsAsc = useMemo(() => [...monthOptions].sort(), [monthOptions]);

  const filteredRecords = useMemo(() => {
    if (!selectedMonth) return yearFilteredRecords;
    return yearFilteredRecords.filter((r) => monthKey(r.fechaSolicitud) === selectedMonth);
  }, [yearFilteredRecords, selectedMonth]);

  const activeRecords = useMemo(() => filteredRecords.filter((r) => !isAnulado(r)), [filteredRecords]);

  // ---------- KPI 1: valor del mes ----------
  const kpi1 = useMemo(() => {
    const currentMonth = allMonthsAsc[allMonthsAsc.length - 1] || null;
    const lastClosedMonth = allMonthsAsc.length > 1 ? allMonthsAsc[allMonthsAsc.length - 2] : currentMonth;
    const baseMonth = selectedMonth || lastClosedMonth;
    const label = selectedMonth
      ? `${monthLabel(selectedMonth, multiYear)} · mes seleccionado`
      : `${monthLabel(lastClosedMonth || "", multiYear)} · último mes cerrado`;

    const valueFor = (mk) => sum(
      yearFilteredRecords.filter((r) => !isAnulado(r) && monthKey(r.fechaSolicitud) === mk),
      (r) => r.valorConIva
    );

    const value = baseMonth ? valueFor(baseMonth) : 0;
    const idx = allMonthsAsc.indexOf(baseMonth);
    const prevMonth = idx > 0 ? allMonthsAsc[idx - 1] : null;
    const prevValue = prevMonth ? valueFor(prevMonth) : null;
    const delta = prevValue ? ((value - prevValue) / prevValue) * 100 : null;

    let foot = "";
    if (!selectedMonth && currentMonth && currentMonth !== lastClosedMonth) {
      foot = `${monthLabel(currentMonth, multiYear)} en curso: ${fmtPesos(valueFor(currentMonth))}`;
    }

    return { label, value, delta, foot };
  }, [yearFilteredRecords, allMonthsAsc, selectedMonth, multiYear]);

  // ---------- KPI 2: cumplimiento de tiempos ----------
  const cumplimiento = useMemo(() => {
    const conEntrega = activeRecords.filter((r) => r.fechaEntrega);
    const cumplieron = conEntrega.filter((r) => {
      const d = businessDaysBetween(r.fechaSolicitud, r.fechaEntrega);
      return d !== null && d <= 8;
    });
    const pct = conEntrega.length ? (cumplieron.length / conEntrega.length) * 100 : 0;
    return { pct, total: conEntrega.length, cumplieron: cumplieron.length };
  }, [activeRecords]);

  const kpi3 = useMemo(() => {
    const proceso = activeRecords.filter((r) => r.estado === "Proceso");
    return { count: proceso.length, value: sum(proceso, (r) => r.valorConIva) };
  }, [activeRecords]);

  const kpi4 = useMemo(() => {
    const conValor = activeRecords.filter((r) => r.valorConIva != null);
    const avg = conValor.length ? sum(conValor, (r) => r.valorConIva) / conValor.length : null;
    return { avg };
  }, [activeRecords]);

  // ---------- Solicitudes pendientes ----------
  const pendientes = useMemo(() => {
    const list = filteredRecords.filter((r) => {
      if (r.fechaEntrega) return false;
      const e = r.estado;
      return !e || e === "Proceso" || e === "Pendiente";
    });
    return list
      .map((r) => ({ record: r, dias: businessDaysElapsedToToday(r.fechaSolicitud) ?? -1 }))
      .sort((a, b) => b.dias - a.dias);
  }, [filteredRecords]);

  // ---------- Valor de compras por mes ----------
  const valorPorMes = useMemo(() => {
    const currentMonth = allMonthsAsc[allMonthsAsc.length - 1];
    return allMonthsAsc.map((mk) => {
      const rows = filteredRecords.filter((r) => !isAnulado(r) && monthKey(r.fechaSolicitud) === mk);
      return {
        key: mk,
        label: monthLabel(mk, multiYear),
        value: sum(rows, (r) => r.valorConIva),
        highlighted: mk === currentMonth,
      };
    }).filter((d) => selectedMonth ? d.key === selectedMonth : true);
  }, [allMonthsAsc, filteredRecords, multiYear, selectedMonth]);

  // ---------- Valor de compras por área y mes (top 5 áreas + otras) ----------
  const areaMesStack = useMemo(() => {
    const activeAll = filteredRecords.filter((r) => !isAnulado(r));
    const totalsByArea = new Map();
    for (const r of activeAll) {
      const a = r.area || "Sin área";
      totalsByArea.set(a, (totalsByArea.get(a) || 0) + (r.valorConIva || 0));
    }
    const top5 = Array.from(totalsByArea.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name]) => name);

    const months = selectedMonth ? [selectedMonth] : allMonthsAsc;
    const data = months.map((mk) => {
      const rows = activeAll.filter((r) => monthKey(r.fechaSolicitud) === mk);
      const segMap = new Map();
      for (const name of top5) segMap.set(name, 0);
      segMap.set("Otras", 0);
      for (const r of rows) {
        const a = r.area || "Sin área";
        const key = top5.includes(a) ? a : "Otras";
        segMap.set(key, (segMap.get(key) || 0) + (r.valorConIva || 0));
      }
      return {
        key: mk,
        label: monthLabel(mk, multiYear),
        segments: Array.from(segMap.entries()).map(([name, value]) => ({ name, value })),
      };
    });
    return { data, seriesNames: [...top5, "Otras"] };
  }, [filteredRecords, allMonthsAsc, multiYear, selectedMonth]);

  // ---------- Participación por categoría (para la vista Mensual) ----------
  const categoriaParticipacion = useMemo(() => {
    const map = new Map();
    for (const r of activeRecords) {
      const c = r.categoria || "Sin categoría";
      map.set(c, (map.get(c) || 0) + (r.valorConIva || 0));
    }
    const sorted = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    const rows = sorted.slice(0, 5).map(([name, value]) => ({ name, value }));
    const otrasValue = sorted.slice(5).reduce((s, [, v]) => s + v, 0);
    if (otrasValue > 0) rows.push({ name: "Otras", value: otrasValue });
    return rows;
  }, [activeRecords]);

  // ---------- Estado de la compra ----------
  const estadoRows = useMemo(() => {
    const map = new Map();
    for (const r of filteredRecords) {
      const e = estadoLabel(r.estado);
      if (!map.has(e)) map.set(e, { count: 0, value: 0 });
      const entry = map.get(e);
      entry.count += 1;
      entry.value += r.valorConIva || 0;
    }
    const keys = Array.from(map.keys());
    keys.sort((a, b) => {
      const ia = ESTADO_ORDER.indexOf(a);
      const ib = ESTADO_ORDER.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b, "es");
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
    const maxCount = Math.max(1, ...Array.from(map.values()).map((v) => v.count));
    return keys.map((k) => ({ name: k, ...map.get(k), pct: (map.get(k).count / maxCount) * 100 }));
  }, [filteredRecords]);

  // ---------- Tiempos de solicitud a entrega ----------
  const tiempos = useMemo(() => {
    const pendientesRiesgo = filteredRecords.filter((r) => {
      if (r.fechaEntrega || isAnulado(r)) return false;
      const d = businessDaysElapsedToToday(r.fechaSolicitud);
      return d !== null && d > 8;
    }).length;

    const buckets = [
      { label: "0-2", min: 0, max: 2, count: 0 },
      { label: "3-4", min: 3, max: 4, count: 0 },
      { label: "5-6", min: 5, max: 6, count: 0 },
      { label: "7-8", min: 7, max: 8, count: 0 },
      { label: "9-12", min: 9, max: 12, count: 0 },
      { label: "13+", min: 13, max: Infinity, count: 0 },
    ];
    let maxDias = 0;
    const offenders = [];
    for (const r of activeRecords) {
      if (!r.fechaEntrega) continue;
      const d = businessDaysBetween(r.fechaSolicitud, r.fechaEntrega);
      if (d === null) continue;
      maxDias = Math.max(maxDias, d);
      const b = buckets.find((bk) => d >= bk.min && d <= bk.max);
      if (b) b.count += 1;
      if (d > 8) offenders.push({ record: r, over: d - 8, dias: d });
    }
    offenders.sort((a, b) => b.over - a.over);

    return { pendientesRiesgo, buckets, maxDias, offenders: offenders.slice(0, 6) };
  }, [filteredRecords, activeRecords]);

  // ---------- Cumplimiento / incumplimiento por mes (> 8 días hábiles), en % ----------
  const incumplimientoPorMes = useMemo(() => {
    return allMonthsAsc.map((mk) => {
      const rows = activeRecords.filter((r) => r.fechaEntrega && monthKey(r.fechaSolicitud) === mk);
      const incumplioCount = rows.filter((r) => {
        const d = businessDaysBetween(r.fechaSolicitud, r.fechaEntrega);
        return d !== null && d > 8;
      }).length;
      const total = rows.length;
      const cumplioCount = total - incumplioCount;
      const incumplioPct = total ? (incumplioCount / total) * 100 : 0;
      const cumplioPct = total ? (cumplioCount / total) * 100 : 0;
      return {
        key: mk,
        label: monthLabel(mk, multiYear),
        total, cumplioCount, incumplioCount, cumplioPct, incumplioPct,
      };
    }).filter((d) => selectedMonth ? d.key === selectedMonth : true);
  }, [allMonthsAsc, activeRecords, multiYear, selectedMonth]);

  // ---------- Medio de pago ----------
  const medioRows = useMemo(() => {
    const map = new Map();
    for (const r of activeRecords) {
      const m = r.medioPago || "Sin definir";
      if (!map.has(m)) map.set(m, { count: 0, value: 0 });
      const entry = map.get(m);
      entry.count += 1;
      entry.value += r.valorConIva || 0;
    }
    const rows = Array.from(map.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.value - a.value);
    const maxVal = Math.max(1, ...rows.map((r) => r.value));
    return rows.map((r, i) => ({
      ...r,
      pct: (r.value / maxVal) * 100,
      colorVar: SERIES_COLOR_VARS[i % SERIES_COLOR_VARS.length],
    }));
  }, [activeRecords]);

  // ---------- Ahorro (KPI row 5) ----------
  const ahorro = useMemo(() => {
    const cotizados = activeRecords.filter((r) => r.valorCot != null && r.valorConIva != null);
    const outliers = cotizados.filter((r) => r.valorCot > r.valorConIva * 20);
    const validCot = cotizados.filter((r) => !(r.valorCot > r.valorConIva * 20));

    const totalCompras = sum(activeRecords, (r) => r.valorConIva);
    const valorCotizado = sum(validCot, (r) => r.valorCot);
    const valorCompraCotizados = sum(validCot, (r) => r.valorConIva);
    const ahorroTotal = valorCotizado - valorCompraCotizados;
    const pctAhorro = valorCotizado ? (ahorroTotal / valorCotizado) * 100 : null;

    return {
      totalCompras, valorCotizado, valorCompraCotizados, ahorroTotal, pctAhorro,
      outliersCount: outliers.length, validCot,
    };
  }, [activeRecords]);

  // ---------- Cumplimiento de entregas (gauge) ----------
  const gauge = useMemo(() => ({
    pct: cumplimiento.pct,
    total: cumplimiento.total,
    cumplieron: cumplimiento.cumplieron,
    noCumplieron: cumplimiento.total - cumplimiento.cumplieron,
  }), [cumplimiento]);

  // ---------- Resumen ejecutivo ----------
  const resumen = useMemo(() => {
    const ejecutados = filteredRecords.filter((r) => r.estado === "Ejecutado");
    const totalEjecutado = sum(ejecutados, (r) => r.valorConIva);

    let mayorAhorro = null;
    for (const r of ahorro.validCot) {
      const a = (r.valorCot || 0) - (r.valorConIva || 0);
      if (!mayorAhorro || a > mayorAhorro.ahorro) mayorAhorro = { record: r, ahorro: a };
    }

    const areaTotals = new Map();
    for (const r of activeRecords) {
      const a = r.area || "Sin área";
      areaTotals.set(a, (areaTotals.get(a) || 0) + (r.valorConIva || 0));
    }
    let mayorArea = null;
    for (const [name, value] of areaTotals.entries()) {
      if (!mayorArea || value > mayorArea.value) mayorArea = { name, value };
    }

    return {
      totalEjecutado, ejecutadosCount: ejecutados.length,
      ahorroTotal: ahorro.ahorroTotal, pctAhorro: ahorro.pctAhorro,
      mayorAhorro, mayorArea,
      totalCompras: filteredRecords.length,
    };
  }, [filteredRecords, activeRecords, ahorro]);

  // ---------- Compras por área / Ahorro por área ----------
  const porArea = useMemo(() => {
    const map = new Map();
    for (const r of activeRecords) {
      const a = r.area || "Sin área";
      if (!map.has(a)) map.set(a, { count: 0, value: 0, cot: 0, sinCot: 0 });
      const e = map.get(a);
      e.count += 1;
      e.value += r.valorConIva || 0;
      if (r.valorCot != null) e.cot += r.valorCot;
      else e.sinCot += 1;
    }
    const totalValor = sum(activeRecords, (r) => r.valorConIva);
    const rows = Array.from(map.entries()).map(([name, v]) => ({
      name, ...v,
      pctTotal: totalValor ? (v.value / totalValor) * 100 : 0,
      ahorro: v.cot - v.value,
      pctAhorro: v.cot ? ((v.cot - v.value) / v.cot) * 100 : null,
    })).sort((a, b) => b.value - a.value);
    const maxVal = Math.max(1, ...rows.map((r) => r.value));
    const totalSinCot = rows.reduce((s, r) => s + r.sinCot, 0);
    return { rows: rows.map((r) => ({ ...r, barPct: (r.value / maxVal) * 100 })), totalSinCot };
  }, [activeRecords]);

  // ---------- Top 5 proveedores ----------
  const topProveedores = useMemo(() => {
    const map = new Map();
    for (const r of activeRecords) {
      const p = r.proveedor || "Sin proveedor";
      if (!map.has(p)) map.set(p, { count: 0, value: 0 });
      const e = map.get(p);
      e.count += 1;
      e.value += r.valorConIva || 0;
    }
    const total = sum(activeRecords, (r) => r.valorConIva);
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, ...v, pct: total ? (v.value / total) * 100 : 0 }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [activeRecords]);

  // ---------- Compras por responsable ----------
  const porResponsable = useMemo(() => {
    const map = new Map();
    for (const r of filteredRecords) {
      const resp = r.responsable || "Sin responsable";
      if (!map.has(resp)) map.set(resp, { ejecutado: 0, proceso: 0, anulado: 0, total: 0, value: 0 });
      const e = map.get(resp);
      e.total += 1;
      e.value += r.valorConIva || 0;
      if (r.estado === "Ejecutado") e.ejecutado += 1;
      else if (r.estado === "Proceso") e.proceso += 1;
      else if (r.estado === "Anulado") e.anulado += 1;
    }
    const rows = Array.from(map.entries()).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.value - a.value);
    const totals = rows.reduce((acc, r) => ({
      ejecutado: acc.ejecutado + r.ejecutado, proceso: acc.proceso + r.proceso,
      anulado: acc.anulado + r.anulado, total: acc.total + r.total, value: acc.value + r.value,
    }), { ejecutado: 0, proceso: 0, anulado: 0, total: 0, value: 0 });
    return { rows, totals };
  }, [filteredRecords]);

  // ---------- Consumo por categoría y área ----------
  const porCategoriaArea = useMemo(() => {
    const areaMap = new Map();
    for (const r of activeRecords) {
      const a = r.area || "Sin área";
      if (!areaMap.has(a)) areaMap.set(a, { count: 0, value: 0, cats: new Map() });
      const e = areaMap.get(a);
      e.count += 1;
      e.value += r.valorConIva || 0;
      const cat = r.categoria || "Sin categoría";
      e.cats.set(cat, (e.cats.get(cat) || 0) + (r.valorConIva || 0));
    }
    const rows = Array.from(areaMap.entries()).map(([name, v]) => {
      const catList = Array.from(v.cats.entries())
        .map(([cname, cvalue]) => ({ name: cname, value: cvalue, pct: v.value ? (cvalue / v.value) * 100 : 0 }))
        .sort((a, b) => b.value - a.value);
      return { name, count: v.count, value: v.value, top: catList.slice(0, 4), moreCount: Math.max(0, catList.length - 4) };
    }).sort((a, b) => b.value - a.value);
    const totals = rows.reduce((acc, r) => ({ count: acc.count + r.count, value: acc.value + r.value }), { count: 0, value: 0 });
    return { rows, totals };
  }, [activeRecords]);

  async function handleExportPDF() {
    if (!containerRef.current) return;
    setExporting(true);
    setExportError("");
    try {
      const html2canvas = (await import("html2canvas-pro")).default;
      const { jsPDF } = await import("jspdf");

      const bg = getComputedStyle(document.documentElement).getPropertyValue("--page").trim() || "#ffffff";
      const scale = Math.min(2, window.devicePixelRatio || 1.5);
      const canvas = await html2canvas(containerRef.current, {
        backgroundColor: bg,
        scale,
        onclone: (clonedDoc) => {
          // El box-shadow con esquinas redondeadas no se pinta bien en html2canvas
          // (deja bloques grises encima de las tarjetas): se desactiva solo en la
          // captura, sin afectar la vista normal de la app.
          const style = clonedDoc.createElement("style");
          style.textContent = "*{box-shadow:none !important; backdrop-filter:none !important;}";
          clonedDoc.head.appendChild(style);
        },
      });

      const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 24;
      const usableW = pageW - margin * 2;
      const usableH = pageH - margin * 2 - 40;

      const imgW = usableW;
      const imgH = (canvas.height * imgW) / canvas.width;

      const pxPerPage = (usableH * canvas.width) / imgW;
      const totalPages = Math.max(1, Math.ceil(canvas.height / pxPerPage));

      const title = "Sinco · Compras — Dashboard de compras";
      const periodLabel = selectedMonth
        ? monthLabel(selectedMonth, multiYear)
        : selectedYear
          ? `Todo ${selectedYear}`
          : "Todos los períodos";
      const subtitle = `${periodLabel} · Exportado: ${new Date().toLocaleDateString("es-CO")}`;

      for (let page = 0; page < totalPages; page++) {
        if (page > 0) pdf.addPage();
        pdf.setFontSize(14);
        pdf.text(title, margin, margin + 6);
        pdf.setFontSize(9);
        pdf.setTextColor(100);
        pdf.text(subtitle, margin, margin + 20);

        const sliceCanvas = document.createElement("canvas");
        sliceCanvas.width = canvas.width;
        const sliceHeightPx = Math.min(pxPerPage, canvas.height - page * pxPerPage);
        sliceCanvas.height = sliceHeightPx;
        const ctx = sliceCanvas.getContext("2d");
        ctx.drawImage(canvas, 0, page * pxPerPage, canvas.width, sliceHeightPx, 0, 0, canvas.width, sliceHeightPx);
        const sliceImgH = (sliceHeightPx * imgW) / canvas.width;
        pdf.addImage(sliceCanvas.toDataURL("image/png"), "PNG", margin, margin + 30, imgW, sliceImgH);

        pdf.setFontSize(8);
        pdf.setTextColor(120);
        pdf.text(`Página ${page + 1} de ${totalPages}`, pageW - margin - 70, pageH - 12);
      }

      pdf.save(`dashboard_compras_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err) {
      setExportError(err?.message || "No se pudo generar el PDF del dashboard.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div ref={containerRef} className="dashboard-shell">
      <div className="card-head" style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
          <div className="dash-tabs" role="tablist" aria-label="Periodo del dashboard">
            <button type="button" role="tab" aria-selected={viewMode === "mensual"} className="dash-tab" onClick={switchToMensual}>
              Mensual
            </button>
            <button type="button" role="tab" aria-selected={viewMode === "anual"} className="dash-tab" onClick={switchToAnual}>
              Anual
            </button>
          </div>

          {viewMode === "anual" ? (
            <div className="field" style={{ width: 140 }}>
              <label htmlFor="dash-year">Año</label>
              <select id="dash-year" value={selectedYear} onChange={(e) => handleYearChange(e.target.value)}>
                {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          ) : (
            <div className="field" style={{ width: 200 }}>
              <label htmlFor="dash-month">Mes</label>
              <select id="dash-month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}>
                {monthOptions.map((k) => <option key={k} value={k}>{monthLabel(k, true)}</option>)}
              </select>
            </div>
          )}
        </div>
        <div className="spacer" />
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="btn" onClick={handleExportPDF} disabled={exporting}>
            {exporting ? <span className="spinner" /> : <IconFile size={13} />} {exporting ? "Exportando…" : "Exportar PDF"}
          </button>
        </div>
      </div>

      {exportError && <div className="modal-error" style={{ marginBottom: 14 }}>{exportError}</div>}

      {/* KPI row */}
      <div className="kpi-row">
        <div className="kpi" style={{ "--kpi-c": "var(--accent)" }}>
          <div className="kpi-head">
            <div className="label">{kpi1.label}</div>
            <div className="kpi-ic"><IconMoney size={14} /></div>
          </div>
          <div className="value">{fmtPesos(kpi1.value)}</div>
          {kpi1.delta !== null && (
            <div className="delta">
              {kpi1.delta > 0 ? "▲" : kpi1.delta < 0 ? "▼" : "＝"} {Math.abs(kpi1.delta).toFixed(1)}%
            </div>
          )}
          {kpi1.foot && <div className="foot">{kpi1.foot}</div>}
        </div>
        <div className="kpi" style={{ "--kpi-c": cumplimiento.pct >= 80 ? "var(--good)" : cumplimiento.pct >= 50 ? "var(--warning)" : "var(--critical)" }}>
          <div className="kpi-head">
            <div className="label">Cumplimiento de tiempos</div>
            <div className="kpi-ic"><IconClock size={14} /></div>
          </div>
          <div className="value">{cumplimiento.total ? `${cumplimiento.pct.toFixed(0)}%` : "—"}</div>
          <div className="meter-track">
            <div className="meter-fill" style={{ width: `${cumplimiento.pct}%` }} />
          </div>
          <div className="foot">{cumplimiento.cumplieron} de {cumplimiento.total} en 8 días hábiles</div>
        </div>
        <div className="kpi" style={{ "--kpi-c": "var(--warning)" }}>
          <div className="kpi-head">
            <div className="label">En proceso</div>
            <div className="kpi-ic"><IconAlert size={14} /></div>
          </div>
          <div className="value">{fmtNum(kpi3.count)}</div>
          <div className="foot">{fmtPesos(kpi3.value)}</div>
        </div>
        <div className="kpi" style={{ "--kpi-c": "var(--secondary)" }}>
          <div className="kpi-head">
            <div className="label">Ticket promedio</div>
            <div className="kpi-ic"><IconTrendUp size={14} /></div>
          </div>
          <div className="value">{fmtPesos(kpi4.avg)}</div>
        </div>
      </div>

      {/* KPI row 5: ahorro */}
      <div className="kpi-row kpi-row-5">
        <div className="kpi">
          <div className="label">Total compras</div>
          <div className="value">{fmtPesos(ahorro.totalCompras)}</div>
        </div>
        <div className="kpi">
          <div className="label">Valor cotizado</div>
          <div className="value">{fmtPesos(ahorro.valorCotizado)}</div>
        </div>
        <div className="kpi">
          <div className="label">Valor compra (cotizados)</div>
          <div className="value">{fmtPesos(ahorro.valorCompraCotizados)}</div>
        </div>
        <div className="kpi">
          <div className="label">Ahorro total</div>
          <div className="value">{fmtPesos(ahorro.ahorroTotal)}</div>
        </div>
        <div className="kpi">
          <div className="label">% ahorro global</div>
          <div className="value">{ahorro.pctAhorro !== null ? `${ahorro.pctAhorro.toFixed(1)}%` : "—"}</div>
        </div>
      </div>
      {ahorro.outliersCount > 0 && (
        <p className="methodology-note">
          Se excluyeron {ahorro.outliersCount} cotización(es) con valores atípicos (posibles errores de digitación,
          cotizado &gt; 20× el valor de compra) del cálculo de ahorro.
        </p>
      )}

      {/* Cumplimiento de entregas / Resumen ejecutivo */}
      <div className="grid-2" style={{ marginBottom: 14 }}>
        <div className="card">
          <h3>Cumplimiento de entregas</h3>
          <div className="gauge-wrap">
            <GaugeSvg percent={gauge.pct} />
            <div className="gauge-foot">{gauge.cumplieron} de {gauge.total} compras entregadas dentro de 8 días hábiles</div>
            <div className="gauge-breakdown" style={{ width: "100%" }}>
              <div className="estado-row">
                <div className="name">Cumplió</div>
                <div className="track"><div className="fill" style={{ width: `${gauge.total ? (gauge.cumplieron / gauge.total) * 100 : 0}%`, background: "var(--good)" }} /></div>
                <div className="figs"><span className="n">{gauge.cumplieron}</span></div>
              </div>
              <div className="estado-row">
                <div className="name">No cumplió</div>
                <div className="track"><div className="fill" style={{ width: `${gauge.total ? (gauge.noCumplieron / gauge.total) * 100 : 0}%`, background: "var(--critical)" }} /></div>
                <div className="figs"><span className="n">{gauge.noCumplieron}</span></div>
              </div>
            </div>
          </div>
        </div>
        <div className="card">
          <h3>Resumen ejecutivo</h3>
          <div className="summary-grid">
            <div className="detail-item">
              <div className="dlabel">Total ejecutado</div>
              <div className="dvalue">{fmtCOP(resumen.totalEjecutado)}</div>
              <div className="dcap">{resumen.ejecutadosCount} compra(s)</div>
            </div>
            <div className="detail-item">
              <div className="dlabel">Ahorro generado</div>
              <div className="dvalue">{fmtCOP(resumen.ahorroTotal)}</div>
              <div className="dcap">{resumen.pctAhorro !== null ? `${resumen.pctAhorro.toFixed(1)}% sobre cotizado` : "—"}</div>
            </div>
            <div className="detail-item">
              <div className="dlabel">Mayor ahorro individual</div>
              <div className="dvalue">{resumen.mayorAhorro ? fmtCOP(resumen.mayorAhorro.ahorro) : "—"}</div>
              <div className="dcap">
                {resumen.mayorAhorro ? `${resumen.mayorAhorro.record.descripcion || "—"} · ${resumen.mayorAhorro.record.proveedor || "—"}` : "Sin datos"}
              </div>
            </div>
            <div className="detail-item">
              <div className="dlabel">Área con mayor compra</div>
              <div className="dvalue">{resumen.mayorArea ? resumen.mayorArea.name : "—"}</div>
              <div className="dcap">{resumen.mayorArea ? fmtCOP(resumen.mayorArea.value) : ""}</div>
            </div>
            <div className="detail-item full">
              <div className="dlabel">Compras totales</div>
              <div className="dvalue">{fmtNum(resumen.totalCompras)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Solicitudes pendientes */}
      <div className="card card-alert" id="pending-top-list" style={{ marginBottom: 14 }}>
        <div className="card-head">
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <div className="card-alert-ic"><IconAlert size={16} /></div>
            <div>
              <h3>Solicitudes pendientes</h3>
              <p className="card-sub">Sin estado, en proceso o pendiente, sin fecha de entrega registrada.</p>
            </div>
          </div>
          {pendientes.length > 0 && <span className="card-alert-count">{pendientes.length}</span>}
        </div>
        {pendientes.length === 0 ? (
          <div className="empty">No hay solicitudes pendientes sin estado o en proceso.</div>
        ) : (
          <div className="scroll-x">
            <table className="plain-table offenders">
              <thead>
                <tr>
                  <th>#</th><th>Descripción</th><th>Área</th><th>Responsable</th>
                  <th>F. solicitud</th><th>Días</th><th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {pendientes.map((p, i) => {
                  const severity = p.dias > 8 ? "critical" : p.dias > 0 ? "warning" : "muted";
                  return (
                    <tr key={p.record.id} className="clickable" onClick={() => setDetailRecord(p.record)}>
                      <td className="rank">{i + 1}</td>
                      <td>{p.record.descripcion || "—"}</td>
                      <td>{p.record.area || "—"}</td>
                      <td>{p.record.responsable || "—"}</td>
                      <td>{fmtDateDisplay(p.record.fechaSolicitud)}</td>
                      <td><span className={`pill ${severity}`}>{p.dias} d.</span></td>
                      <td>{p.record.estado || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Vista Anual: tendencia por mes · Vista Mensual: participación del mes seleccionado */}
      <div className="grid-2">
        {viewMode === "anual" ? (
          <div className="card">
            <h3>Valor de compras por mes</h3>
            <p className="card-sub">Total con IVA por mes de solicitud (excluye anulados).</p>
            <BarChartSvg data={valorPorMes} />
          </div>
        ) : (
          <div className="card">
            <h3>Participación por área</h3>
            <p className="card-sub">Total con IVA del mes, por área (excluye anulados).</p>
            <PieChartSvg data={areaMesStack.data[0]?.segments || []} formatValue={fmtCOP} />
          </div>
        )}
        <div className="card">
          {viewMode === "anual" ? (
            <>
              <h3>Valor de compras por área y mes</h3>
              <p className="card-sub">Top 5 áreas por valor, resto agrupado en &quot;Otras&quot;.</p>
              <StackedBarChartSvg data={areaMesStack.data} seriesNames={areaMesStack.seriesNames} />
            </>
          ) : (
            <>
              <h3>Participación por categoría</h3>
              <p className="card-sub">Top 5 categorías por valor del mes, resto agrupado en &quot;Otras&quot;.</p>
              <PieChartSvg data={categoriaParticipacion} formatValue={fmtCOP} />
            </>
          )}
        </div>
      </div>

      {/* Estado / tiempos */}
      <div className="grid-2">
        <div className="card">
          <h3>Estado de la compra</h3>
          {estadoRows.map((r) => (
            <div className="estado-row" key={r.name}>
              <div className="name">{r.name}</div>
              <div className="track">
                <div className="fill" style={{ width: `${r.pct}%`, background: "var(--accent)" }} />
              </div>
              <div className="figs">
                <span className="n">{fmtCOP(r.value)}</span>
                <span className="c">{r.count} solicitud(es)</span>
              </div>
            </div>
          ))}
        </div>
        <div className="card">
          <h3>Tiempos de solicitud a entrega</h3>
          <div className="kpi-row" style={{ gridTemplateColumns: "1fr 1fr", marginBottom: 14 }}>
            <div className="kpi">
              <div className="label">Cumplimiento</div>
              <div className="value">{cumplimiento.total ? `${cumplimiento.pct.toFixed(0)}%` : "—"}</div>
            </div>
            <div className="kpi">
              <div className="label">Pendientes en riesgo</div>
              <div className="value">{tiempos.pendientesRiesgo}</div>
            </div>
          </div>
          <HistogramSvg buckets={tiempos.buckets} maxDiasBucket={tiempos.maxDias} />
          {tiempos.offenders.length > 0 && (
            <div className="offenders">
              <table>
                <thead><tr><th>Descripción</th><th>Área</th><th>Días</th><th>Estado</th></tr></thead>
                <tbody>
                  {tiempos.offenders.map((o) => (
                    <tr key={o.record.id}>
                      <td>{o.record.descripcion || "—"}</td>
                      <td>{o.record.area || "—"}</td>
                      <td><span className="pill critical">{o.dias} d.</span></td>
                      <td>{o.record.estado || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Cumplimiento / incumplimiento por mes (solo vista Anual: en Mensual es un solo mes, no aporta). */}
      {viewMode === "anual" && (
        <div className="card card-alert" style={{ marginBottom: 14 }}>
          <div className="card-head">
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <div className="card-alert-ic"><IconAlert size={16} /></div>
              <div>
                <h3>Cumplimiento por mes</h3>
                <p className="card-sub">% de solicitudes entregadas dentro (cumplió) y fuera (no cumplió) del plazo de 8 días hábiles, por mes de solicitud.</p>
              </div>
            </div>
            {incumplimientoPorMes.reduce((s, d) => s + d.incumplioCount, 0) > 0 && (
              <span className="card-alert-count">{incumplimientoPorMes.reduce((s, d) => s + d.incumplioCount, 0)}</span>
            )}
          </div>
          <div className="legend" style={{ marginBottom: 8 }}>
            <span className="chip"><span className="swatch" style={{ background: "var(--good)" }} />Cumplió</span>
            <span className="chip"><span className="swatch" style={{ background: "var(--critical)" }} />No cumplió</span>
          </div>
          <CompliancePercentChartSvg data={incumplimientoPorMes} />
        </div>
      )}

      {/* Medio de pago */}
      <div className="card" style={{ marginBottom: 14 }}>
        <h3>Medio de pago</h3>
        {medioRows.map((r) => (
          <div className="medio-row" key={r.name}>
            <div className="name">{r.name}</div>
            <div className="track">
              <div className="fill" style={{ width: `${r.pct}%`, background: `var(${r.colorVar})` }} />
            </div>
            <div className="figs">
              <span className="n">{fmtCOP(r.value)}</span>
              <span className="c">{r.count} solicitud(es)</span>
            </div>
          </div>
        ))}
      </div>

      {/* Compras por área / Ahorro por área */}
      <div className="grid-2">
        <div className="card">
          <h3>Compras por área</h3>
          {porArea.rows.map((r) => (
            <div className="estado-row" key={r.name}>
              <div className="name">{r.name}</div>
              <div className="track"><div className="fill" style={{ width: `${r.barPct}%`, background: "var(--accent)" }} /></div>
              <div className="figs">
                <span className="n">{fmtCOP(r.value)}</span>
                <span className="c">{r.count} · {r.pctTotal.toFixed(1)}%</span>
              </div>
            </div>
          ))}
          <div className="table-wrap-plain" style={{ marginTop: 10 }}>
            <table className="plain-table">
              <thead><tr><th>Área</th><th className="num">Cant.</th><th className="num">Valor</th><th className="num">% total</th></tr></thead>
              <tbody>
                {porArea.rows.map((r) => (
                  <tr key={r.name}>
                    <td>{r.name}</td><td className="num">{fmtNum(r.count)}</td>
                    <td className="num">{fmtCOP(r.value)}</td><td className="num">{r.pctTotal.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <h3>Ahorro por área</h3>
          {porArea.rows.map((r) => (
            <div className="estado-row" key={r.name}>
              <div className="name">{r.name}</div>
              <div className="track">
                <div className="fill" style={{ width: `${Math.min(100, Math.abs(r.pctAhorro || 0))}%`, background: (r.pctAhorro ?? 0) < 0 ? "var(--critical)" : "var(--good)" }} />
              </div>
              <div className="figs">
                <span className="n">{fmtCOP(r.ahorro)}</span>
                <span className="c">{r.pctAhorro !== null ? `${r.pctAhorro.toFixed(1)}%` : "sin cotización"}</span>
              </div>
            </div>
          ))}
          <div className="table-wrap-plain" style={{ marginTop: 10 }}>
            <table className="plain-table">
              <thead>
                <tr><th>Área</th><th className="num">Cotizado</th><th className="num">Comprado</th><th className="num">Ahorro</th><th className="num">% ahorro</th><th className="num">Sin cot.</th></tr>
              </thead>
              <tbody>
                {porArea.rows.map((r) => (
                  <tr key={r.name}>
                    <td>{r.name}</td><td className="num">{fmtCOP(r.cot)}</td><td className="num">{fmtCOP(r.value)}</td>
                    <td className="num">{fmtCOP(r.ahorro)}</td>
                    <td className="num">{r.pctAhorro !== null ? `${r.pctAhorro.toFixed(1)}%` : "—"}</td>
                    <td className="num">{r.sinCot}/{r.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="methodology-note">
            {porArea.totalSinCot} compra(s) no tienen cotización registrada. En esos casos el ahorro del área puede
            aparecer negativo o subestimado, porque se resta todo lo comprado (incluidas las compras sin cotizar)
            contra lo cotizado.
          </p>
        </div>
      </div>

      {/* Top proveedores / por responsable */}
      <div className="grid-2">
        <div className="card">
          <h3>Top 5 proveedores por volumen de compra</h3>
          <div className="table-wrap-plain">
            <table className="plain-table">
              <thead><tr><th>#</th><th>Proveedor</th><th className="num">Compras</th><th className="num">Valor</th><th className="num">% del total</th></tr></thead>
              <tbody>
                {topProveedores.map((p, i) => (
                  <tr key={p.name}>
                    <td className="rank">{i + 1}</td><td>{p.name}</td>
                    <td className="num">{fmtNum(p.count)}</td><td className="num">{fmtCOP(p.value)}</td>
                    <td className="num">{p.pct.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <h3>Compras por responsable</h3>
          <div className="table-wrap-plain">
            <table className="plain-table">
              <thead>
                <tr><th>Responsable</th><th className="num">Ejecutado</th><th className="num">Proceso</th><th className="num">Anulado</th><th className="num">Total</th><th className="num">Valor</th></tr>
              </thead>
              <tbody>
                {porResponsable.rows.map((r) => (
                  <tr key={r.name}>
                    <td>{r.name}</td><td className="num">{r.ejecutado}</td><td className="num">{r.proceso}</td>
                    <td className="num">{r.anulado}</td><td className="num">{r.total}</td><td className="num">{fmtCOP(r.value)}</td>
                  </tr>
                ))}
                <tr className="total-row">
                  <td>Total</td><td className="num">{porResponsable.totals.ejecutado}</td>
                  <td className="num">{porResponsable.totals.proceso}</td><td className="num">{porResponsable.totals.anulado}</td>
                  <td className="num">{porResponsable.totals.total}</td><td className="num">{fmtCOP(porResponsable.totals.value)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Consumo por categoría y área */}
      <div className="card" style={{ marginBottom: 14 }}>
        <h3>Consumo por categoría y área</h3>
        <div className="table-wrap-plain">
          <table className="plain-table">
            <thead><tr><th>Área</th><th className="num">Cant.</th><th className="num">Valor total</th><th>Categorías</th></tr></thead>
            <tbody>
              {porCategoriaArea.rows.map((r) => (
                <tr key={r.name}>
                  <td>{r.name}</td>
                  <td className="num">{fmtNum(r.count)}</td>
                  <td className="num">{fmtCOP(r.value)}</td>
                  <td className="cat-cell">
                    {r.top.map((c) => (
                      <div className="cat-line" key={c.name}>
                        <span className="cat-name">{c.name}</span>{" — "}
                        <span className="cat-figs">{fmtCOP(c.value)} ({c.pct.toFixed(1)}%)</span>
                      </div>
                    ))}
                    {r.moreCount > 0 && <div className="cat-more">+{r.moreCount} categoría(s) más</div>}
                  </td>
                </tr>
              ))}
              <tr className="total-row">
                <td>Total</td>
                <td className="num">{fmtNum(porCategoriaArea.totals.count)}</td>
                <td className="num">{fmtCOP(porCategoriaArea.totals.value)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {detailRecord && <DetailModal record={detailRecord} onClose={() => setDetailRecord(null)} />}
    </div>
  );
}
