"use client";

import { useConfirmar } from "@/components/Confirmar";
import { useState } from "react";
import { IconDownload } from "@/components/icons";

// «Exportar a Excel» de cualquier tabla de la app: todas las filas del filtro actual (no solo la página), con las
// columnas de la pantalla. columnas: [{ t: "Título", v: (fila) => valor, ancho? }]; los montos van como número con su
// signo (se pueden sumar en Excel). filas = arreglo ya cargado, u obtener = función async que trae todo.
export default function BotonExcel({ nombre, hoja = "Datos", columnas, filas, obtener, etiqueta = "Exportar a Excel", deshabilitado = false }) {
  const { avisar } = useConfirmar();
  const [ocupado, setOcupado] = useState(false);
  async function exportar() {
    setOcupado(true);
    try {
      const datos = filas || (await obtener());
      const XLSX = await import("xlsx");
      const aoa = [columnas.map((c) => c.t), ...datos.map((r) => columnas.map((c) => { const v = c.v(r); return v == null ? "" : v; }))];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws["!cols"] = columnas.map((c, i) => ({ wch: c.ancho || Math.min(60, Math.max(10, c.t.length + 2, ...aoa.slice(1, 200).map((f) => String(f[i] ?? "").length + 1))) }));
      ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(0, aoa.length - 1), c: columnas.length - 1 } }) };
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, hoja.slice(0, 31));
      XLSX.writeFile(wb, `${nombre}-${new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" })}.xlsx`);
    } catch (e) {
      avisar({ titulo: "No se pudo exportar", mensaje: e.message });
    } finally { setOcupado(false); }
  }
  return (
    <button type="button" className="btn small" onClick={exportar} disabled={ocupado || deshabilitado} title="Descarga todas las filas del filtro actual">
      {ocupado ? <span className="spinner" /> : <IconDownload size={13} />} {etiqueta}
    </button>
  );
}
