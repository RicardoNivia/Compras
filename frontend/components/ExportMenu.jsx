"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { monthKey, monthLabel } from "@/lib/format";
import { saveBlob, todayISO } from "@/lib/exportHelpers";
import { IconDownload, IconFile } from "@/components/icons";

const CSV_HEADERS = [
  "Fecha solicitud", "Fecha entrega", "Área", "Responsable", "Estado de compra",
  "Categoría", "Descripción", "Medio de pago", "Licitación", "Estado legalización",
  "Radicado", "Nit", "Proveedor", "FE", "Valor + IVA", "Valor sin IVA", "Valor cotizado", "Observaciones",
];

function csvField(v) {
  const s = v === null || v === undefined ? "" : String(v);
  if (/[;"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function recordToCsvRow(r) {
  return [
    r.fechaSolicitud || "", r.fechaEntrega || "", r.area || "", r.responsable || "",
    r.estado || "", r.categoria || "", r.descripcion || "", r.medioPago || "",
    r.licitacion || "", r.estadoLegalizacion || "", r.radicado ? "Sí" : "No",
    r.nit || "", r.proveedor || "", r.fe || "",
    r.valorConIva ?? "", r.valorSinIva ?? "", r.valorCot ?? "", r.observaciones || "",
  ].map(csvField).join(";");
}

export default function ExportMenu({ allRecords, filteredRecords }) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState("");
  const [month, setMonth] = useState("");
  const [exporting, setExporting] = useState(null); // "pdf" | null
  const [error, setError] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    function onDocClick(e) {
      if (open && ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    function onKeyDown(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const yearOptions = useMemo(() => {
    const set = new Set();
    for (const r of allRecords) {
      const k = monthKey(r.fechaSolicitud);
      if (k) set.add(k.slice(0, 4));
    }
    return Array.from(set).sort().reverse();
  }, [allRecords]);

  const monthOptions = useMemo(() => {
    const set = new Set();
    for (const r of allRecords) {
      const k = monthKey(r.fechaSolicitud);
      if (k && (!year || k.startsWith(year))) set.add(k);
    }
    return Array.from(set).sort().reverse();
  }, [allRecords, year]);

  const multiYear = useMemo(() => {
    const years = new Set(monthOptions.map((k) => k.slice(0, 4)));
    return years.size > 1;
  }, [monthOptions]);

  function handleYearChange(y) {
    setYear(y);
    if (y && month && !month.startsWith(y)) setMonth("");
  }

  function getExportRows() {
    // Refleja exactamente lo que la tabla de Registros está mostrando
    // (búsqueda/área/estado/etc.), más el año/mes elegidos aquí.
    let base = filteredRecords;
    if (year) base = base.filter((r) => (monthKey(r.fechaSolicitud) || "").startsWith(year));
    if (month) base = base.filter((r) => monthKey(r.fechaSolicitud) === month);
    return base;
  }

  function exportCSV() {
    setError("");
    try {
      const rows = getExportRows();
      const lines = [CSV_HEADERS.join(";"), ...rows.map(recordToCsvRow)];
      const content = "﻿" + lines.join("\r\n");
      saveBlob(`compras_registros_${todayISO()}.csv`, content, "text/csv;charset=utf-8");
      setOpen(false);
    } catch (err) {
      setError(err?.message || "No se pudo exportar el Excel.");
    }
  }

  async function exportExcel() {
    setExporting("xlsx");
    setError("");
    try {
      const rows = getExportRows();
      const XLSX = await import("xlsx");
      const data = rows.map((r) => ({
        "Fecha solicitud": r.fechaSolicitud || "",
        "Fecha entrega": r.fechaEntrega || "",
        "Área": r.area || "",
        "Responsable": r.responsable || "",
        "Estado de compra": r.estado || "",
        "Categoría": r.categoria || "",
        "Descripción": r.descripcion || "",
        "Medio de pago": r.medioPago || "",
        "Licitación": r.licitacion || "",
        "Estado legalización": r.estadoLegalizacion || "",
        "Radicado": r.radicado ? "Sí" : "No",
        "Nit": r.nit || "",
        "Proveedor": r.proveedor || "",
        "FE": r.fe || "",
        "Valor + IVA": r.valorConIva ?? "",
        "Valor sin IVA": r.valorSinIva ?? "",
        "Valor cotizado": r.valorCot ?? "",
        "Observaciones": r.observaciones || "",
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      ws["!cols"] = [
        { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 16 }, { wch: 16 },
        { wch: 32 }, { wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 9 }, { wch: 14 }, { wch: 20 },
        { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 32 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Registros");
      XLSX.writeFile(wb, `compras_registros_${todayISO()}.xlsx`);
      setOpen(false);
    } catch (err) {
      setError(err?.message || "No se pudo generar el Excel.");
    } finally {
      setExporting(null);
    }
  }

  async function exportPDF() {
    setExporting("pdf");
    setError("");
    try {
      const rows = getExportRows();
      const { jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;
      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      const totalValor = rows.reduce((s, r) => s + (r.valorConIva || 0), 0);

      doc.setFontSize(14);
      doc.text("Sinco · Compras — Registros", 28, 30);
      doc.setFontSize(9);
      doc.setTextColor(100);
      doc.text(
        `Exportado: ${new Date().toLocaleDateString("es-CO")} · ${rows.length} registro(s) · Valor total: ${new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(totalValor)}`,
        28, 46
      );

      autoTable(doc, {
        startY: 58,
        head: [[
          "F. solicitud", "F. entrega", "Área", "Responsable", "Estado", "Categoría",
          "Descripción", "Medio de pago", "Estado legaliz.", "Radicado", "Nit", "Proveedor",
          "Valor + IVA", "Observaciones",
        ]],
        body: rows.map((r) => [
          r.fechaSolicitud || "", r.fechaEntrega || "", r.area || "", r.responsable || "",
          r.estado || "", r.categoria || "", r.descripcion || "", r.medioPago || "",
          r.estadoLegalizacion || "", r.radicado ? "Sí" : "No", r.nit || "", r.proveedor || "",
          r.valorConIva != null ? new Intl.NumberFormat("es-CO").format(r.valorConIva) : "",
          r.observaciones || "",
        ]),
        styles: { fontSize: 7, cellPadding: 3 },
        headStyles: { fillColor: [32, 99, 160] },
        didDrawPage: () => {
          const pageCount = doc.internal.getNumberOfPages();
          const page = doc.internal.getCurrentPageInfo().pageNumber;
          doc.setFontSize(8);
          doc.text(
            `Página ${page} de ${pageCount}`,
            doc.internal.pageSize.getWidth() - 90,
            doc.internal.pageSize.getHeight() - 14
          );
        },
      });

      doc.save(`compras_registros_${todayISO()}.pdf`);
      setOpen(false);
    } catch (err) {
      setError(err?.message || "No se pudo generar el PDF.");
    } finally {
      setExporting(null);
    }
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button type="button" className="btn-sync" onClick={() => setOpen((v) => !v)}>
        <IconDownload size={13} /> Exportar
      </button>
      <div className="sync-panel" hidden={!open}>
        <h4>Exportar registros</h4>
        <p>Elige año y/o mes (opcional) y el formato de exportación.</p>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="export-year">Año</label>
            <select id="export-year" value={year} onChange={(e) => handleYearChange(e.target.value)}>
              <option value="">Todos</option>
              {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="export-month">Mes</label>
            <select id="export-month" value={month} onChange={(e) => setMonth(e.target.value)}>
              <option value="">Todos</option>
              {monthOptions.map((k) => (
                <option key={k} value={k}>{monthLabel(k, multiYear)}</option>
              ))}
            </select>
          </div>
        </div>
        {error && <div className="modal-error" style={{ marginBottom: 10 }}>{error}</div>}
        <div className="export-options">
          <button type="button" className="btn" onClick={exportExcel} disabled={!!exporting}>
            {exporting === "xlsx" ? <span className="spinner" /> : <IconFile size={13} />} {exporting === "xlsx" ? "Generando…" : "Excel (.xlsx)"}
          </button>
          <button type="button" className="btn" onClick={exportCSV} disabled={!!exporting}>
            <IconFile size={13} /> CSV
          </button>
          <button type="button" className="btn" onClick={exportPDF} disabled={!!exporting}>
            {exporting === "pdf" ? <span className="spinner" /> : <IconFile size={13} />} {exporting === "pdf" ? "Generando…" : "PDF"}
          </button>
        </div>
      </div>
    </div>
  );
}
