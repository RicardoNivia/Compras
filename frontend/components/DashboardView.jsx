"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import DetailModal from "@/components/DetailModal";
import BarChartSvg from "@/components/charts/BarChartSvg";
import StackedBarChartSvg from "@/components/charts/StackedBarChartSvg";
import CompliancePercentChartSvg from "@/components/charts/CompliancePercentChartSvg";
import PieChartSvg from "@/components/charts/PieChartSvg";
import GaugeSvg from "@/components/charts/GaugeSvg";
import Sparkline from "@/components/charts/Sparkline";
import { AnimatedNumber } from "@/components/charts/chartKit";
import { fmtCOP, fmtCompact, fmtNum, fmtPesos, fmtDateDisplay, monthKey, monthLabel } from "@/lib/format";
import { businessDaysBetween, businessDaysElapsedToToday } from "@/lib/businessDays";
import { getDiasInfo } from "@/lib/diasInfo";
import KpiExplain from "@/components/KpiExplain";
import { IconFile, IconMoney, IconClock, IconAlert, IconTrendUp, IconSpark } from "@/components/icons";

const ESTADO_ORDER = ["Ejecutado", "Proceso", "Pendiente", "Anulado", "Sin estado"];
const SERIES_COLOR_VARS = ["--s1", "--s2", "--s3", "--s4", "--s5", "--sOther"];
const ESTADO_COLOR_VARS = {
  Ejecutado: "--good",
  Proceso: "--warning",
  Pendiente: "--secondary",
  Anulado: "--critical",
  "Sin estado": "--muted",
};
const OFFENDERS_PAGE_SIZE = 8;

function sum(arr, fn) {
  return arr.reduce((s, x) => s + (fn(x) || 0), 0);
}

// Versión compacta de un registro, para mandarle solo lo necesario al backend
// cuando se pide "Explícame este número" (ver components/KpiExplain.jsx).
function compactRecord(r, extra) {
  return {
    fecha: r.fechaSolicitud, entrega: r.fechaEntrega || null, area: r.area || "Sin área",
    categoria: r.categoria || null, proveedor: r.proveedor || null, descripcion: r.descripcion || null,
    estado: r.estado || null, valor: r.valorConIva ?? null, ...extra,
  };
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

const PRESUPUESTO_ALERTA_PCT = 80; // % de consumo del presupuesto a partir del cual se resalta en amarillo
const PRESUPUESTO_CRITICO_PCT = 90; // % de consumo a partir del cual se resalta en rojo (cerca del límite o excedido)

export default function DashboardView({ records, presupuestos = [] }) {
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
    setSelectedYear((y) => y || currentYear);
    setSelectedMonth((m) => m || currentMonthKey);
  }

  // Años disponibles a partir de todos los registros (más el año actual, para que
  // ambas pestañas siempre tengan un año válido seleccionado por defecto).
  const yearOptions = useMemo(() => {
    const set = new Set([currentYear]);
    for (const r of records) {
      const k = monthKey(r.fechaSolicitud);
      if (k) set.add(k.slice(0, 4));
    }
    return Array.from(set).sort().reverse();
  }, [records, currentYear]);

  // El año se comparte entre las dos pestañas: eligiendo el mismo año en Mensual
  // y en Anual, ambas deben quedar restringidas exactamente al mismo conjunto de
  // registros (ver yearFilteredRecords/yearRecordsForCategoriaArea más abajo).
  function handleYearChange(year) {
    setSelectedYear(year);
  }

  const yearFilteredRecords = useMemo(() => {
    if (!selectedYear) return records;
    return records.filter((r) => (monthKey(r.fechaSolicitud) || "").startsWith(selectedYear));
  }, [records, selectedYear]);

  const monthOptions = useMemo(() => {
    const set = new Set(viewMode === "mensual" && selectedYear === currentYear ? [currentMonthKey] : []);
    for (const r of yearFilteredRecords) {
      const k = monthKey(r.fechaSolicitud);
      if (k) set.add(k);
    }
    return Array.from(set).sort().reverse();
  }, [yearFilteredRecords, viewMode, currentMonthKey, selectedYear, currentYear]);

  // Si al cambiar de año en Mensual el mes elegido no existe en el nuevo año
  // (sin registros ese mes), se ajusta al mes disponible más reciente de ese año.
  useEffect(() => {
    if (viewMode !== "mensual" || monthOptions.length === 0) return;
    if (!monthOptions.includes(selectedMonth)) setSelectedMonth(monthOptions[0]);
  }, [viewMode, monthOptions, selectedMonth]);

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
    // Vista Anual: el KPI es el total del año y se compara contra el año anterior (no contra el mes anterior).
    // En el año en curso se compara el mismo período (enero hasta el mes actual) para no cotejar un año parcial con uno completo.
    if (viewMode === "anual" && selectedYear) {
      const prevYear = String(Number(selectedYear) - 1);
      const esActual = selectedYear === currentYear;
      const mesTope = esActual ? currentMonthKey.slice(5) : "12";
      const delAnio = (anio, hastaMes) => records.filter((r) => {
        const mk = monthKey(r.fechaSolicitud) || "";
        return !isAnulado(r) && mk.startsWith(anio) && mk.slice(5) <= hastaMes;
      });
      const actuales = delAnio(selectedYear, mesTope);
      const previos = delAnio(prevYear, mesTope);
      const value = sum(actuales, (r) => r.valorConIva);
      const prevValue = previos.length ? sum(previos, (r) => r.valorConIva) : null;
      const delta = prevValue ? ((value - prevValue) / prevValue) * 100 : null;
      const meses = Array.from({ length: Number(mesTope) }, (_, i) => `${selectedYear}-${String(i + 1).padStart(2, "0")}`);
      const serie = meses.map((mk) => sum(actuales.filter((r) => monthKey(r.fechaSolicitud) === mk), (r) => r.valorConIva));
      const periodoPrev = esActual ? `mismo período de ${prevYear}` : prevYear;
      return {
        label: `${selectedYear} · total del año${esActual ? " a la fecha" : ""}`,
        value, delta, foot: "", prevValue, serie,
        deltaLabel: `vs ${periodoPrev}`,
        prevLabel: prevValue != null ? periodoPrev : null,
        explainRecords: [
          ...actuales.map((r) => compactRecord(r, { periodo: "actual" })),
          ...previos.map((r) => compactRecord(r, { periodo: "anterior" })),
        ],
      };
    }

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

    const recordsFor = (mk, periodo) => yearFilteredRecords
      .filter((r) => !isAnulado(r) && monthKey(r.fechaSolicitud) === mk)
      .map((r) => compactRecord(r, { periodo }));
    const explainRecords = [
      ...(baseMonth ? recordsFor(baseMonth, "actual") : []),
      ...(prevMonth ? recordsFor(prevMonth, "anterior") : []),
    ];

    // Tendencia de los 6 meses hasta el mes base (para el sparkline del KPI).
    const serie = idx >= 0 ? allMonthsAsc.slice(Math.max(0, idx - 5), idx + 1).map(valueFor) : [];

    return { label, value, delta, foot, prevValue, serie, deltaLabel: "vs mes anterior", prevLabel: prevMonth ? monthLabel(prevMonth, multiYear) : null, explainRecords };
  }, [yearFilteredRecords, allMonthsAsc, selectedMonth, multiYear, viewMode, selectedYear, records, currentYear, currentMonthKey]);

  // ---------- KPI 2: cumplimiento de tiempos ----------
  // Cuenta como "resuelta" toda solicitud ya entregada, y también las que
  // siguen pendientes/en proceso pero ya superaron los 8 días hábiles (ya
  // incumplieron aunque no se hayan entregado). Las pendientes que aún están
  // dentro del plazo no se cuentan (su resultado todavía no está definido).
  const cumplimiento = useMemo(() => {
    const conEntrega = activeRecords.filter((r) => r.fechaEntrega);
    const cumplieron = conEntrega.filter((r) => {
      const d = businessDaysBetween(r.fechaSolicitud, r.fechaEntrega);
      return d !== null && d <= 8;
    });
    const pendientesVencidos = activeRecords.filter((r) => {
      if (r.fechaEntrega) return false;
      const e = r.estado;
      if (e && e !== "Proceso" && e !== "Pendiente") return false;
      const d = businessDaysElapsedToToday(r.fechaSolicitud);
      return d !== null && d > 8;
    });
    const total = conEntrega.length + pendientesVencidos.length;
    const pct = total ? (cumplieron.length / total) * 100 : 0;
    const explainRecords = [
      ...conEntrega.map((r) => {
        const d = businessDaysBetween(r.fechaSolicitud, r.fechaEntrega);
        return compactRecord(r, { diasHabiles: d, cumplio: d !== null && d <= 8 });
      }),
      ...pendientesVencidos.map((r) => compactRecord(r, { diasHabiles: businessDaysElapsedToToday(r.fechaSolicitud), cumplio: false, sinEntregar: true })),
    ];
    return { pct, total, cumplieron: cumplieron.length, explainRecords };
  }, [activeRecords]);

  const kpi3 = useMemo(() => {
    const proceso = activeRecords.filter((r) => r.estado === "Proceso");
    return { count: proceso.length, value: sum(proceso, (r) => r.valorConIva), explainRecords: proceso.map((r) => compactRecord(r)) };
  }, [activeRecords]);

  const kpi4 = useMemo(() => {
    const conValor = activeRecords.filter((r) => r.valorConIva != null);
    const avg = conValor.length ? sum(conValor, (r) => r.valorConIva) / conValor.length : null;
    return { avg, explainRecords: conValor.map((r) => compactRecord(r)) };
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
    const totalCount = filteredRecords.length || 1;
    return keys.map((k) => ({
      name: k, ...map.get(k),
      pct: (map.get(k).count / maxCount) * 100,
      pctTotal: (map.get(k).count / totalCount) * 100,
    }));
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

    const totalConDias = buckets.reduce((s, b) => s + b.count, 0) || 1;
    const maxCount = Math.max(1, ...buckets.map((b) => b.count));
    const enrichedBuckets = buckets.map((b, i) => ({
      ...b,
      pct: (b.count / maxCount) * 100,
      pctTotal: (b.count / totalConDias) * 100,
      withinSla: b.max <= 8,
    }));

    return { pendientesRiesgo, buckets: enrichedBuckets, maxDias, offenders };
  }, [filteredRecords, activeRecords]);

  const [offendersPage, setOffendersPage] = useState(1);
  const offendersTotalPages = Math.max(1, Math.ceil(tiempos.offenders.length / OFFENDERS_PAGE_SIZE));
  const offendersCurrentPage = Math.min(offendersPage, offendersTotalPages);
  const pagedOffenders = useMemo(() => {
    const start = (offendersCurrentPage - 1) * OFFENDERS_PAGE_SIZE;
    return tiempos.offenders.slice(start, start + OFFENDERS_PAGE_SIZE);
  }, [tiempos.offenders, offendersCurrentPage]);

  // ---------- Cumplimiento / incumplimiento por mes (> 8 días hábiles), en % ----------
  // Igual que el KPI de cumplimiento: además de las entregadas, incluye las
  // pendientes/en proceso que ya superaron los 8 días hábiles (cuentan como
  // no cumplió), agrupadas por el mes de su fecha de solicitud.
  const incumplimientoPorMes = useMemo(() => {
    function diasDe(r) {
      return r.fechaEntrega
        ? businessDaysBetween(r.fechaSolicitud, r.fechaEntrega)
        : businessDaysElapsedToToday(r.fechaSolicitud);
    }
    return allMonthsAsc.map((mk) => {
      const rows = activeRecords.filter((r) => {
        if (monthKey(r.fechaSolicitud) !== mk) return false;
        if (r.fechaEntrega) return true;
        const e = r.estado;
        if (e && e !== "Proceso" && e !== "Pendiente") return false;
        const d = businessDaysElapsedToToday(r.fechaSolicitud);
        return d !== null && d > 8;
      });
      const incumplioCount = rows.filter((r) => {
        const d = diasDe(r);
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

  // ---------- Presupuesto por área (configurado en la sección "Presupuesto",
  // por año — en modo "categoría" el total del área es la suma de categorías) ----------
  const refYear = Number(selectedYear || currentYear);
  const presupuestoPorArea = useMemo(() => {
    const map = new Map();
    for (const p of presupuestos) {
      if (p.anio === refYear) map.set(p.area, p.total);
    }
    return map;
  }, [presupuestos, refYear]);

  // Presupuesto por categoría dentro de cada área — solo existe cuando el año
  // se maneja en modo "categoria" (ver sección "Presupuesto").
  const presupuestoCategoriasPorArea = useMemo(() => {
    const map = new Map();
    for (const p of presupuestos) {
      if (p.anio !== refYear || p.modo !== "categoria") continue;
      const inner = new Map();
      for (const c of p.categorias || []) inner.set(c.categoria, c.valor);
      map.set(p.area, inner);
    }
    return map;
  }, [presupuestos, refYear]);

  // ---------- Consumo por categoría y área ----------
  // El consumo mostrado aquí es siempre el acumulado de todo el año de
  // referencia (refYear) — igual en la vista Mensual que en la Anual, sin
  // importar qué mes esté seleccionado. Solo el presupuesto de comparación
  // cambia: en Mensual se compara contra el presupuesto anual dividido en 12
  // (presupuesto del mes); en Anual, contra el anual completo.
  const yearRecordsForCategoriaArea = useMemo(() => {
    return records.filter((r) => !isAnulado(r) && (monthKey(r.fechaSolicitud) || "").startsWith(String(refYear)));
  }, [records, refYear]);

  const porCategoriaArea = useMemo(() => {
    const areaMap = new Map();
    for (const r of yearRecordsForCategoriaArea) {
      const a = r.area || "Sin área";
      if (!areaMap.has(a)) areaMap.set(a, { count: 0, value: 0, valueMes: 0, cats: new Map() });
      const e = areaMap.get(a);
      e.count += 1;
      e.value += r.valorConIva || 0;
      // Además del acumulado del año (value), en la vista Mensual se guarda
      // aparte lo que corresponde SOLO al mes seleccionado — para mostrar
      // ambos números en la tabla (valor del mes vs. acumulado del año).
      if (viewMode === "mensual" && monthKey(r.fechaSolicitud) === selectedMonth) {
        e.valueMes += r.valorConIva || 0;
      }
      const cat = r.categoria || "Sin categoría";
      e.cats.set(cat, (e.cats.get(cat) || 0) + (r.valorConIva || 0));
    }
    const rows = Array.from(areaMap.entries()).map(([name, v]) => {
      const catPresupuestos = presupuestoCategoriasPorArea.get(name) || new Map();
      // Unión de categorías con gasto y categorías con presupuesto asignado —
      // así una categoría presupuestada sin compras todavía también se muestra.
      const catNames = new Set([...v.cats.keys(), ...catPresupuestos.keys()]);
      const catList = Array.from(catNames)
        .map((cname) => {
          const cvalue = v.cats.get(cname) || 0;
          const catPresupuestoAnual = catPresupuestos.get(cname) ?? null;
          const catPctPresupuesto = catPresupuestoAnual ? (cvalue / catPresupuestoAnual) * 100 : null;
          return {
            name: cname, value: cvalue, pct: v.value ? (cvalue / v.value) * 100 : 0,
            presupuesto: catPresupuestoAnual, pctPresupuesto: catPctPresupuesto,
          };
        })
        .sort((a, b) => b.value - a.value);

      const presupuestoAnual = presupuestoPorArea.get(name) ?? null;
      const presupuesto = presupuestoAnual;
      const pctPresupuesto = presupuesto ? (v.value / presupuesto) * 100 : null;
      const presupuestoEstado = pctPresupuesto === null
        ? "sin-datos"
        : pctPresupuesto >= PRESUPUESTO_CRITICO_PCT
          ? "excedido"
          : pctPresupuesto >= PRESUPUESTO_ALERTA_PCT
            ? "alerta"
            : "ok";
      const disponible = presupuesto != null ? presupuesto - v.value : null;

      // Las categorías con presupuesto asignado siempre se muestran (aunque no
      // estén entre las de mayor gasto) — el resto de los 4 puestos se llena
      // con las de mayor valor.
      const conPresupuesto = catList.filter((c) => c.presupuesto != null);
      const sinPresupuesto = catList.filter((c) => c.presupuesto == null);
      const top = [...conPresupuesto, ...sinPresupuesto.slice(0, Math.max(0, 4 - conPresupuesto.length))]
        .sort((a, b) => b.value - a.value);

      return {
        name, count: v.count, value: v.value, valueMes: v.valueMes, top, moreCount: Math.max(0, catList.length - top.length),
        presupuestoAnual, presupuesto, pctPresupuesto, presupuestoEstado, disponible,
      };
    }).sort((a, b) => b.value - a.value);
    const totals = rows.reduce((acc, r) => ({
      count: acc.count + r.count,
      value: acc.value + r.value,
      valueMes: acc.valueMes + r.valueMes,
      presupuesto: acc.presupuesto + (r.presupuesto || 0),
      disponible: acc.disponible + (r.disponible || 0),
      gastadoConPresupuesto: acc.gastadoConPresupuesto + (r.presupuesto != null ? r.value : 0),
      conPresupuesto: acc.conPresupuesto || r.presupuesto != null,
    }), { count: 0, value: 0, valueMes: 0, presupuesto: 0, disponible: 0, gastadoConPresupuesto: 0, conPresupuesto: false });
    return { rows, totals };
  }, [yearRecordsForCategoriaArea, presupuestoPorArea, presupuestoCategoriasPorArea, viewMode, selectedMonth]);

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
      const pxPerPage = (usableH * canvas.width) / imgW;

      // Puntos de corte seguros: los límites (top/bottom, en px del canvas) de
      // cada bloque de primer nivel del dashboard (KPIs, tarjetas, gráficos).
      // Al paginar, se evita cortar un bloque a la mitad — se corta entre
      // bloques, aunque eso deje una página un poco más corta de lo posible.
      // Se usa getBoundingClientRect (no offsetTop, que es relativo al ancestro
      // posicionado más cercano, no necesariamente el contenedor del dashboard).
      const containerRect = containerRef.current.getBoundingClientRect();
      const scaleY = canvas.height / containerRect.height;
      const blockBounds = Array.from(containerRef.current.children)
        .map((el) => {
          const rect = el.getBoundingClientRect();
          return {
            top: (rect.top - containerRect.top) * scaleY,
            bottom: (rect.bottom - containerRect.top) * scaleY,
          };
        })
        .filter((b) => b.bottom > b.top);

      const pageBreaks = [0];
      let cursor = 0;
      while (cursor < canvas.height - 1) {
        const naturalEnd = Math.min(cursor + pxPerPage, canvas.height);
        const safeEnds = blockBounds
          .map((b) => b.bottom)
          .filter((y) => y > cursor + 1 && y <= naturalEnd);
        const end = Math.round(safeEnds.length ? Math.max(...safeEnds) : naturalEnd);
        pageBreaks.push(end);
        cursor = end;
      }
      const totalPages = pageBreaks.length - 1;

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

        const sliceTop = pageBreaks[page];
        const sliceHeightPx = pageBreaks[page + 1] - sliceTop;
        const sliceCanvas = document.createElement("canvas");
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = sliceHeightPx;
        const ctx = sliceCanvas.getContext("2d");
        ctx.drawImage(canvas, 0, sliceTop, canvas.width, sliceHeightPx, 0, 0, canvas.width, sliceHeightPx);
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
            <>
              <div className="field" style={{ width: 110 }}>
                <label htmlFor="dash-year-mensual">Año</label>
                <select id="dash-year-mensual" value={selectedYear} onChange={(e) => handleYearChange(e.target.value)}>
                  {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div className="field" style={{ width: 170 }}>
                <label htmlFor="dash-month">Mes</label>
                <select id="dash-month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}>
                  {monthOptions.map((k) => <option key={k} value={k}>{monthLabel(k, multiYear)}</option>)}
                </select>
              </div>
            </>
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
          <div className="value"><AnimatedNumber value={kpi1.value} format={fmtPesos} /></div>
          {kpi1.delta !== null && (
            <div className={`delta delta-chip ${kpi1.delta > 0 ? "up" : kpi1.delta < 0 ? "down" : ""}`} title={`Frente a: ${kpi1.deltaLabel.replace("vs ", "")}`}>
              {kpi1.delta > 0 ? "▲" : kpi1.delta < 0 ? "▼" : "＝"} {Math.abs(kpi1.delta).toFixed(1)}% <span className="delta-vs">{kpi1.deltaLabel}</span>
            </div>
          )}
          <Sparkline data={kpi1.serie} color="var(--accent)" />
          {kpi1.foot && <div className="foot">{kpi1.foot}</div>}
          <KpiExplain
            label={kpi1.label} value={fmtPesos(kpi1.value)}
            comparisonLabel={kpi1.prevLabel} comparisonValue={kpi1.prevValue != null ? fmtPesos(kpi1.prevValue) : null}
            records={kpi1.explainRecords}
          />
        </div>
        <div className="kpi" style={{ "--kpi-c": cumplimiento.pct >= 80 ? "var(--good)" : cumplimiento.pct >= 50 ? "var(--warning)" : "var(--critical)" }}>
          <div className="kpi-head">
            <div className="label">Cumplimiento de tiempos</div>
            <div className="kpi-ic"><IconClock size={14} /></div>
          </div>
          <div className="value">{cumplimiento.total ? <AnimatedNumber value={Math.round(cumplimiento.pct)} format={(v) => `${v}%`} /> : "—"}</div>
          <div className="meter-track">
            <div className="meter-fill" style={{ width: `${cumplimiento.pct}%` }} />
          </div>
          <div className="foot">{cumplimiento.cumplieron} de {cumplimiento.total} en 8 días hábiles</div>
          <KpiExplain
            label="Cumplimiento de tiempos" value={cumplimiento.total ? `${cumplimiento.pct.toFixed(0)}%` : "—"}
            records={cumplimiento.explainRecords}
          />
        </div>
        <div className="kpi" style={{ "--kpi-c": "var(--warning)" }}>
          <div className="kpi-head">
            <div className="label">En proceso</div>
            <div className="kpi-ic"><IconAlert size={14} /></div>
          </div>
          <div className="value"><AnimatedNumber value={kpi3.count} format={fmtNum} /></div>
          <div className="foot">{fmtPesos(kpi3.value)}</div>
          <KpiExplain label="En proceso" value={`${fmtNum(kpi3.count)} (${fmtPesos(kpi3.value)})`} records={kpi3.explainRecords} />
        </div>
        <div className="kpi" style={{ "--kpi-c": "var(--secondary)" }}>
          <div className="kpi-head">
            <div className="label">Ticket promedio</div>
            <div className="kpi-ic"><IconTrendUp size={14} /></div>
          </div>
          <div className="value"><AnimatedNumber value={kpi4.avg} format={fmtPesos} /></div>
          <KpiExplain label="Ticket promedio" value={fmtPesos(kpi4.avg)} records={kpi4.explainRecords} />
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

      {/* Presupuesto vs. gastado a nivel general */}
      {porCategoriaArea.totals.conPresupuesto && (
        <div className="card" style={{ marginBottom: 14 }}>
          <h3>Presupuesto vs. gastado — nivel general</h3>
          <p className="card-sub">
            Suma de las áreas con presupuesto configurado para {refYear}.
          </p>
          <div className="kpi-row" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
            <div className="kpi" style={{ "--kpi-c": "var(--accent)" }}>
              <div className="kpi-head"><div className="label">Presupuestado</div><div className="kpi-ic"><IconMoney size={14} /></div></div>
              <div className="value">{fmtCOP(porCategoriaArea.totals.presupuesto)}</div>
            </div>
            <div className="kpi">
              <div className="label">Gastado</div>
              <div className="value">{fmtCOP(porCategoriaArea.totals.gastadoConPresupuesto)}</div>
            </div>
            <div className="kpi" style={{ "--kpi-c": (() => {
              const pct = porCategoriaArea.totals.presupuesto ? (porCategoriaArea.totals.gastadoConPresupuesto / porCategoriaArea.totals.presupuesto) * 100 : null;
              return pct === null ? "var(--muted)" : pct >= PRESUPUESTO_CRITICO_PCT ? "var(--critical)" : pct >= PRESUPUESTO_ALERTA_PCT ? "var(--warning)" : "var(--good)";
            })() }}>
              <div className="label">% consumido</div>
              <div className="value">
                {porCategoriaArea.totals.presupuesto
                  ? `${((porCategoriaArea.totals.gastadoConPresupuesto / porCategoriaArea.totals.presupuesto) * 100).toFixed(1)}%`
                  : "—"}
              </div>
            </div>
            <div className="kpi">
              <div className="label">Disponible</div>
              <div className={`value${porCategoriaArea.totals.disponible < 0 ? " text-critical" : ""}`}>{fmtCOP(porCategoriaArea.totals.disponible)}</div>
            </div>
          </div>
        </div>
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
            {porCategoriaArea.totals.conPresupuesto && (
              <>
                <div className="detail-item">
                  <div className="dlabel">Presupuestado vs. gastado</div>
                  <div className="dvalue">
                    {fmtCOP(porCategoriaArea.totals.gastadoConPresupuesto)} / {fmtCOP(porCategoriaArea.totals.presupuesto)}
                  </div>
                  <div className="dcap">
                    {porCategoriaArea.totals.presupuesto
                      ? `${((porCategoriaArea.totals.gastadoConPresupuesto / porCategoriaArea.totals.presupuesto) * 100).toFixed(1)}% consumido`
                      : "—"}
                  </div>
                </div>
                <div className="detail-item">
                  <div className="dlabel">Disponible de presupuesto</div>
                  <div className={`dvalue${porCategoriaArea.totals.disponible < 0 ? " text-critical" : ""}`}>
                    {fmtCOP(porCategoriaArea.totals.disponible)}
                  </div>
                </div>
              </>
            )}
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
                      <td className="truncate">
                        {p.record.descripcion ? (
                          <span className="desc-tooltip-wrap">
                            <span className="desc-text desc-text-ancha">{p.record.descripcion}</span>
                            <span className="desc-tooltip-bubble">{p.record.descripcion}</span>
                          </span>
                        ) : "—"}
                      </td>
                      <td className="truncate">
                        {p.record.area ? (
                          <span className="desc-tooltip-wrap">
                            <span className="desc-text">{p.record.area}</span>
                            <span className="desc-tooltip-bubble">{p.record.area}</span>
                          </span>
                        ) : "—"}
                      </td>
                      <td className="truncate">
                        {p.record.responsable ? (
                          <span className="desc-tooltip-wrap">
                            <span className="desc-text">{p.record.responsable}</span>
                            <span className="desc-tooltip-bubble">{p.record.responsable}</span>
                          </span>
                        ) : "—"}
                      </td>
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
            <BarChartSvg data={valorPorMes} onSelect={(d) => { setViewMode("mensual"); setSelectedMonth(d.key); }} />
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

      {/* Estado de la compra */}
      <div className="card" style={{ marginBottom: 14 }}>
        <h3>Estado de la compra</h3>
        <div className="estado-cards-grid">
          {estadoRows.map((r) => (
            <div className="estado-card" key={r.name}>
              <div className="estado-card-head">
                <span className="estado-dot" style={{ background: `var(${ESTADO_COLOR_VARS[r.name] || "--accent"})` }} />
                <span className="estado-card-name">{r.name}</span>
              </div>
              <div className="estado-card-value">{fmtCOP(r.value)}</div>
              <div className="track">
                <div className="fill" style={{ width: `${r.pct}%`, background: `var(${ESTADO_COLOR_VARS[r.name] || "--accent"})` }} />
              </div>
              <div className="estado-card-foot">{r.count} solicitud(es) · {r.pctTotal.toFixed(1)}% del total</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tiempos de solicitud a entrega */}
      <div className="card" style={{ marginBottom: 14 }}>
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
        <div className="dist-bars">
          {tiempos.buckets.map((b) => (
            <div className="estado-row" key={b.label}>
              <div className="name">{b.label} días</div>
              <div className="track">
                <div className="fill" style={{ width: `${b.pct}%`, background: b.withinSla ? "var(--good)" : "var(--critical)" }} />
              </div>
              <div className="figs">
                <span className="n">{b.count}</span>
                <span className="c">{b.pctTotal.toFixed(1)}%</span>
              </div>
            </div>
          ))}
        </div>
        {tiempos.offenders.length > 0 && (
          <div className="offenders" style={{ marginTop: 14 }}>
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead><tr><th>Descripción</th><th>Área</th><th>Días</th><th>Estado</th><th>Observación</th></tr></thead>
                <tbody>
                  {pagedOffenders.map((o) => (
                    <tr key={o.record.id}>
                      <td>{o.record.descripcion || "—"}</td>
                      <td>{o.record.area || "—"}</td>
                      <td><span className="pill critical">{o.dias} d.</span></td>
                      <td>{o.record.estado || "—"}</td>
                      <td>{o.record.observaciones || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
              <div className="page-btns">
                <button type="button" className="btn small" disabled={offendersCurrentPage <= 1} onClick={() => setOffendersPage((p) => p - 1)}>Anterior</button>
                <button type="button" className="btn small" disabled={offendersCurrentPage >= offendersTotalPages} onClick={() => setOffendersPage((p) => p + 1)}>Siguiente</button>
              </div>
              <span className="count-note">Página {offendersCurrentPage} de {offendersTotalPages}</span>
              <div className="spacer" />
              <span className="count-note">{tiempos.offenders.length} solicitud(es) con más de 8 días hábiles</span>
            </div>
          </div>
        )}
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
        <p className="card-sub">
          Presupuesto {refYear}: presupuesto configurado para el año (configúralo en la sección "Presupuesto").
          Se resalta en amarillo desde el {PRESUPUESTO_ALERTA_PCT}% de consumo, y en rojo desde el {PRESUPUESTO_CRITICO_PCT}% (cerca del límite o ya excedido).
        </p>
        <div className="table-wrap-plain">
          <table className="plain-table">
            <thead>
              <tr>
                <th>Área</th><th className="num">Cant.</th>
                {viewMode === "mensual" && <th className="num">Valor del mes</th>}
                <th className="num">Valor acumulado ({refYear})</th>
                <th className="num">Presupuesto ({refYear})</th>
                <th className="num">Disponible</th>
                <th className="num">% consumido</th>
                <th>Categorías</th>
              </tr>
            </thead>
            <tbody>
              {porCategoriaArea.rows.map((r) => (
                <tr key={r.name} className={r.presupuestoEstado === "excedido" ? "row-critical" : r.presupuestoEstado === "alerta" ? "row-warning" : ""}>
                  <td>{r.name}</td>
                  <td className="num">{fmtNum(r.count)}</td>
                  {viewMode === "mensual" && <td className="num">{fmtCOP(r.valueMes)}</td>}
                  <td className="num">{fmtCOP(r.value)}</td>
                  <td className="num">{r.presupuesto != null ? fmtCOP(r.presupuesto) : "—"}</td>
                  <td className={`num${r.disponible !== null && r.disponible < 0 ? " text-critical" : ""}`}>
                    {r.disponible !== null ? fmtCOP(r.disponible) : "—"}
                  </td>
                  <td className="num">
                    {r.pctPresupuesto !== null ? (
                      <span className={`pill ${r.presupuestoEstado === "excedido" ? "critical" : r.presupuestoEstado === "alerta" ? "warning" : "good"}`}>
                        {r.presupuestoEstado === "excedido" && <IconAlert size={11} />} {r.pctPresupuesto.toFixed(1)}%
                      </span>
                    ) : "—"}
                  </td>
                  <td className="cat-cell">
                    {r.top.map((c) => (
                      <div className="cat-line" key={c.name}>
                        <span className="cat-name">{c.name}</span>{" — "}
                        <span className="cat-figs">{fmtCOP(c.value)} ({c.pct.toFixed(1)}%)</span>
                        {c.presupuesto != null && (
                          <span className={`cat-presupuesto${c.pctPresupuesto >= PRESUPUESTO_CRITICO_PCT ? " text-critical" : c.pctPresupuesto >= PRESUPUESTO_ALERTA_PCT ? " text-warning" : ""}`}>
                            {" "}/ presup. {fmtCOP(c.presupuesto)}{c.pctPresupuesto !== null ? ` (${c.pctPresupuesto.toFixed(0)}%)` : ""}
                          </span>
                        )}
                      </div>
                    ))}
                    {r.moreCount > 0 && <div className="cat-more">+{r.moreCount} categoría(s) más</div>}
                  </td>
                </tr>
              ))}
              <tr className="total-row">
                <td>Total</td>
                <td className="num">{fmtNum(porCategoriaArea.totals.count)}</td>
                {viewMode === "mensual" && <td className="num">{fmtCOP(porCategoriaArea.totals.valueMes)}</td>}
                <td className="num">{fmtCOP(porCategoriaArea.totals.value)}</td>
                <td className="num">{porCategoriaArea.totals.conPresupuesto ? fmtCOP(porCategoriaArea.totals.presupuesto) : "—"}</td>
                <td className={`num${porCategoriaArea.totals.conPresupuesto && porCategoriaArea.totals.disponible < 0 ? " text-critical" : ""}`}>
                  {porCategoriaArea.totals.conPresupuesto ? fmtCOP(porCategoriaArea.totals.disponible) : "—"}
                </td>
                <td className="num"></td>
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
