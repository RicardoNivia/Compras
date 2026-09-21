"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import RegistrosView from "@/components/RegistrosView";
import DashboardView from "@/components/DashboardView";
import Sidebar from "@/components/Sidebar";
import { monthKey, monthLabel } from "@/lib/format";
import { saveBlob, todayISO } from "@/lib/exportHelpers";

const TAB_TITLES = {
  savings: "Dashboard de compras",
  registros: "Registros",
};

const CSV_HEADERS = [
  "Fecha solicitud", "Fecha entrega", "Área", "Responsable", "Estado de compra",
  "Categoría", "Descripción", "Medio de pago", "Licitación", "Estado legalización",
  "Radicado", "Proveedor", "FE", "Valor + IVA", "Valor sin IVA", "Valor cotizado", "Observaciones",
];

function csvField(v) {
  const s = v === null || v === undefined ? "" : String(v);
  if (/[;"\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function recordToCsvRow(r) {
  return [
    r.fechaSolicitud || "", r.fechaEntrega || "", r.area || "", r.responsable || "",
    r.estado || "", r.categoria || "", r.descripcion || "", r.medioPago || "",
    r.licitacion || "", r.estadoLegalizacion || "", r.radicado ? "Sí" : "No",
    r.proveedor || "", r.fe || "",
    r.valorConIva ?? "", r.valorSinIva ?? "", r.valorCot ?? "", r.observaciones || "",
  ].map(csvField).join(";");
}

export default function PanelCompras({ initialRecords, initialMeta }) {
  const [records, setRecords] = useState(initialRecords || []);
  const [meta] = useState(initialMeta || {});
  const [activeTab, setActiveTab] = useState("savings"); // "savings" (dashboard) | "registros"
  const [exportOpen, setExportOpen] = useState(false);
  const [exportMonth, setExportMonth] = useState("");
  const exportRef = useRef(null);

  // Filtros/orden actuales de la tabla de Registros, provistos por RegistrosView
  // para que la exportación use los mismos registros filtrados/ordenados.
  const [registrosFiltered, setRegistrosFiltered] = useState([]);

  useEffect(() => {
    function onDocClick(e) {
      if (exportOpen && exportRef.current && !exportRef.current.contains(e.target)) {
        setExportOpen(false);
      }
    }
    function onKeyDown(e) {
      if (e.key === "Escape") setExportOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [exportOpen]);

  const monthOptions = useMemo(() => {
    const set = new Set();
    for (const r of records) {
      const k = monthKey(r.fechaSolicitud);
      if (k) set.add(k);
    }
    return Array.from(set).sort().reverse();
  }, [records]);

  const multiYear = useMemo(() => {
    const years = new Set(monthOptions.map((k) => k.slice(0, 4)));
    return years.size > 1;
  }, [monthOptions]);

  function getExportRows() {
    const base = registrosFiltered.length ? registrosFiltered : records;
    if (!exportMonth) return base;
    return base.filter((r) => monthKey(r.fechaSolicitud) === exportMonth);
  }

  function exportCSV() {
    const rows = getExportRows();
    const lines = [CSV_HEADERS.join(";"), ...rows.map(recordToCsvRow)];
    const content = "﻿" + lines.join("\r\n");
    saveBlob(`compras_registros_${todayISO()}.csv`, content, "text/csv;charset=utf-8");
    setExportOpen(false);
  }

  async function exportPDF() {
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
        "Descripción", "Medio de pago", "Estado legaliz.", "Radicado", "Proveedor",
        "Valor + IVA", "Observaciones",
      ]],
      body: rows.map((r) => [
        r.fechaSolicitud || "", r.fechaEntrega || "", r.area || "", r.responsable || "",
        r.estado || "", r.categoria || "", r.descripcion || "", r.medioPago || "",
        r.estadoLegalizacion || "", r.radicado ? "Sí" : "No", r.proveedor || "",
        r.valorConIva != null ? new Intl.NumberFormat("es-CO").format(r.valorConIva) : "",
        r.observaciones || "",
      ]),
      styles: { fontSize: 7, cellPadding: 3 },
      headStyles: { fillColor: [42, 120, 214] },
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
    setExportOpen(false);
  }

  async function exportWord() {
    const rows = getExportRows();
    const {
      Document, Packer, Table, TableRow, TableCell, Paragraph, TextRun,
      WidthType, PageOrientation, HeadingLevel,
    } = await import("docx");

    const headerCells = [
      "F. solicitud", "F. entrega", "Área", "Responsable", "Estado", "Categoría",
      "Descripción", "Medio de pago", "Estado legaliz.", "Radicado", "Proveedor",
      "Valor + IVA", "Observaciones",
    ].map((h) => new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })],
    }));

    const bodyRows = rows.map((r) => new TableRow({
      children: [
        r.fechaSolicitud || "", r.fechaEntrega || "", r.area || "", r.responsable || "",
        r.estado || "", r.categoria || "", r.descripcion || "", r.medioPago || "",
        r.estadoLegalizacion || "", r.radicado ? "Sí" : "No", r.proveedor || "",
        r.valorConIva != null ? new Intl.NumberFormat("es-CO").format(r.valorConIva) : "",
        r.observaciones || "",
      ].map((v) => new TableCell({ children: [new Paragraph(String(v))] })),
    }));

    const table = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [new TableRow({ children: headerCells, tableHeader: true }), ...bodyRows],
    });

    const doc = new Document({
      sections: [{
        properties: { page: { size: { orientation: PageOrientation.LANDSCAPE } } },
        children: [
          new Paragraph({ text: "Sinco · Compras — Registros", heading: HeadingLevel.HEADING_1 }),
          new Paragraph({
            children: [new TextRun({
              text: `Exportado: ${new Date().toLocaleDateString("es-CO")} · ${rows.length} registro(s)`,
              color: "666666",
            })],
          }),
          new Paragraph({ text: "" }),
          table,
        ],
      }],
    });

    const blob = await Packer.toBlob(doc);
    saveBlob(
      `compras_registros_${todayISO()}.docx`,
      blob,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    setExportOpen(false);
  }

  return (
    <div className="app-shell">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      <div className="app-main">
        <header className="topbar">
          <div className="brand">
            <span className="mark">{TAB_TITLES[activeTab]}</span>
            <span className="sep">·</span>
            <span className="sub">{records.length} registros</span>
          </div>
          <div ref={exportRef} style={{ position: "relative", marginLeft: "auto" }}>
            <button type="button" className="btn-sync" onClick={() => setExportOpen((v) => !v)}>
              <span className="ic">⬇️</span> Exportar
            </button>
            <div className="sync-panel" hidden={!exportOpen}>
              <h4>Exportar registros</h4>
              <p>Elige un mes (opcional) y el formato de exportación.</p>
              <div className="field" style={{ marginBottom: 10 }}>
                <label htmlFor="export-month">Mes</label>
                <select
                  id="export-month"
                  value={exportMonth}
                  onChange={(e) => setExportMonth(e.target.value)}
                >
                  <option value="">Todos los meses</option>
                  {monthOptions.map((k) => (
                    <option key={k} value={k}>{monthLabel(k, multiYear)}</option>
                  ))}
                </select>
              </div>
              <div className="export-options">
                <button type="button" className="btn" onClick={exportCSV}>📊 Excel (.csv)</button>
                <button type="button" className="btn" onClick={exportPDF}>📄 PDF</button>
                <button type="button" className="btn" onClick={exportWord}>📝 Word (.docx)</button>
              </div>
            </div>
          </div>
        </header>

        <main>
          <div className="view" hidden={activeTab !== "savings"}>
            <DashboardView records={records} />
          </div>
          <div className="view" hidden={activeTab !== "registros"}>
            <RegistrosView
              records={records}
              setRecords={setRecords}
              onFilteredChange={setRegistrosFiltered}
            />
          </div>
        </main>
      </div>
    </div>
  );
}
