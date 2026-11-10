"use client";

import { useCallback, useEffect, useState } from "react";
import { tesMaestros } from "@/lib/tesoreriaApi";

export const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
export const hoyCO = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
export const anioActual = () => Number(hoyCO().slice(0, 4));
export const mesActual = () => Number(hoyCO().slice(5, 7));
export const anios = () => { const a = anioActual(); return [a - 1, a, a + 1]; };
export const fechaCorta = (f) => (f ? new Date(`${f}T12:00:00`).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }) : "—");

// Texto largo en una celda: una sola línea, con el texto completo al pasar el mouse.
export function Celda({ v, ancha = false }) {
  if (v == null || v === "") return <span className="muted">—</span>;
  return (
    <span className="desc-tooltip-wrap">
      <span className={`desc-text${ancha ? " desc-text-ancha" : ""}`}>{v}</span>
      <span className="desc-tooltip-bubble">{v}</span>
    </span>
  );
}

const PILL = { proyectado: ["warning", "Proyectado"], ejecutado: ["accent", "Ejecutado"], conciliado: ["good", "Conciliado"] };
export function EstadoPill({ mov }) {
  const k = mov.conciliado ? "conciliado" : mov.estado;
  const [cls, txt] = PILL[k] || ["muted", k];
  return <span className={`pill ${cls}`}>{txt}</span>;
}

const TIPO = { ingreso: "Ingreso", egreso: "Egreso", traslado: "Traslado" };
export const tipoTexto = (t) => TIPO[t] || t;

// Año + mes (mes opcional con «todo el año»).
export function SelectorPeriodo({ anio, mes, onCambio, conTodoElAnio = false, id = "tes-periodo" }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
      <div className="field" style={{ width: 110 }}>
        <label htmlFor={`${id}-anio`}>Año</label>
        <select id={`${id}-anio`} value={anio} onChange={(e) => onCambio({ anio: Number(e.target.value), mes })}>
          {anios().map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>
      <div className="field" style={{ width: 150 }}>
        <label htmlFor={`${id}-mes`}>Mes</label>
        <select id={`${id}-mes`} value={mes || ""} onChange={(e) => onCambio({ anio, mes: e.target.value ? Number(e.target.value) : null })}>
          {conTodoElAnio && <option value="">Todo el año</option>}
          {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
      </div>
    </div>
  );
}

// Catálogos del módulo (cuentas, ítems, conceptos, pagadores) con recarga.
export function useCatalogos() {
  const [cat, setCat] = useState(null);
  const [error, setError] = useState("");
  const cargar = useCallback(() => tesMaestros().then((r) => { setCat(r); setError(""); }).catch((e) => setError(e.message)), []);
  useEffect(() => { cargar(); }, [cargar]);
  return { cat, error, recargar: cargar };
}

export function Aviso({ texto, onCerrar }) {
  useEffect(() => { if (!texto) return undefined; const t = setTimeout(onCerrar, 4500); return () => clearTimeout(t); }, [texto, onCerrar]);
  return texto ? <div className="toast toast-good" role="status">{texto}</div> : null;
}
