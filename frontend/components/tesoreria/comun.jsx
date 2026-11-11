"use client";

import { useCallback, useEffect, useState } from "react";
import { tesMaestros, tesAnios } from "@/lib/tesoreriaApi";
import { Portal } from "@/components/notificaciones/ui";

// Piezas comunes de Tesorería, con la línea de diseño de la app (tarjetas, píldoras, modales y tablas de globals.css).

export const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
export const MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
export const hoyCO = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
export const anioActual = () => Number(hoyCO().slice(0, 4));
export const mesActual = () => Number(hoyCO().slice(5, 7));
export const anios = () => { const a = anioActual(); return [a - 3, a - 2, a - 1, a, a + 1]; };
export const fechaCorta = (f) => (f ? new Date(`${f}T12:00:00`).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" }) : "—");
export const fechaSinAnio = (f) => (f ? new Date(`${f}T12:00:00`).toLocaleDateString("es-CO", { day: "numeric", month: "short" }) : "—");

export const TIPOS_PAGO = { I: "Ingreso", E: "Egreso", J: "Jornal", S: "Saldo", T: "Traslado" };
export const PERIODICIDADES = { quincenal: "Quincenal", mensual: "Mensual", bimestral: "Bimestral", trimestral: "Trimestral", semestral: "Semestral", anual: "Anual" };

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

// Estado de un pago programado: P pendiente (rojo si ya venció) / E pagado.
export function EstadoPago({ estado, vencido = false }) {
  if (estado === "E") return <span className="pill good">E · Pagado</span>;
  return <span className={`pill ${vencido ? "critical" : "warning"}`}>{vencido ? "P · Vencido" : "P · Pendiente"}</span>;
}

export function TipoPago({ tipo }) {
  const cls = tipo === "I" ? "good" : tipo === "E" ? "critical" : "muted";
  return <span className={`pill ${cls}`}>{tipo} · {TIPOS_PAGO[tipo] || tipo}</span>;
}

// Valor de dinero con su signo y color (egresos/débitos en rojo, ingresos/créditos en verde).
export function Dinero({ valor, texto, fuerte = false }) {
  const cls = valor < 0 ? "tes-neg" : valor > 0 ? "tes-pos" : "muted";
  return <span className={`tes-num ${cls}`}>{fuerte ? <strong>{texto}</strong> : texto}</span>;
}

// Catálogos del módulo (bancos, medios, ítems, conceptos, pagadores) con recarga.
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

// Modal con el diseño de la app. ancho en px; pie = botones.
export function Modal({ titulo, sub, onClose, ancho = 720, children, pie }) {
  useEffect(() => {
    const k = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <Portal>
      <div className="modal-overlay tes-tema" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="modal" role="dialog" aria-modal="true" aria-label={titulo} style={{ maxWidth: ancho, width: "100%" }}>
          <div className="modal-head">
            <div style={{ minWidth: 0 }}>
              <h3 style={{ margin: 0 }}>{titulo}</h3>
              {sub && <span className="card-sub">{sub}</span>}
            </div>
            <button type="button" className="btn-ghost icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
          </div>
          <div className="modal-body tes-modal-body">{children}</div>
          {pie && <div className="modal-foot">{pie}</div>}
        </div>
      </div>
    </Portal>
  );
}

// Todas las filas de un listado paginado del backend (páginas de 100), para exportar el filtro completo.
export async function todasLasPaginas(fn, filtros = {}) {
  const primera = await fn({ ...filtros, page: 1, size: 100 });
  const filas = [...primera.items];
  const paginas = Math.ceil((primera.total || 0) / 100);
  for (let p = 2; p <= paginas; p++) filas.push(...(await fn({ ...filtros, page: p, size: 100 })).items);
  return filas;
}

// «Exportar a Excel»: componente común de la app (components/BotonExcel.jsx).
export { default as BotonExcel } from "@/components/BotonExcel";

// Años de Tesorería (GET /api/tesoreria/anios): por defecto hasta 2028, los que tienen datos y los creados a mano.
// Se comparte entre selectores y se vuelve a pedir con refrescarAnios() después de crear uno.
let aniosCache = null;
const oyentesAnios = new Set();
export function refrescarAnios() {
  aniosCache = tesAnios().catch(() => null);
  aniosCache.then((l) => oyentesAnios.forEach((f) => f(l)));
  return aniosCache;
}
// fuente "movimientos": también los años con movimientos del banco (Movimientos, Saldos, Conciliación); si no, los
// años anteriores solo salen si tienen pagos.
export function useAniosTesoreria(fuente = "pagos") {
  const [r, setR] = useState(null);
  useEffect(() => {
    oyentesAnios.add(setR);
    (aniosCache || refrescarAnios()).then(setR);
    return () => { oyentesAnios.delete(setR); };
  }, []);
  return r ? (fuente === "movimientos" ? r.aniosMovimientos : fuente === "saldos" ? r.aniosSaldos || r.aniosMovimientos : r.anios) : null;
}

// Selector de año: los años de Tesorería (del actual hasta 2028, los anteriores con datos y los creados a mano). Un año nuevo
// solo se crea en Gastos periódicos («Crear otro año»). value "" = todos (solo con conTodos).
export function SelectorAnio({ id, label = "Año", value, onChange, anios = [], conTodos = false, ancho = 170, fuente = "pagos" }) {
  const actual = anioActual();
  const delServidor = useAniosTesoreria(fuente);
  // Los años anteriores al actual solo salen si tienen datos (los manda el servidor o vienen en anios).
  const lista = [...new Set([...(delServidor || []), ...anios, actual, actual + 1, ...(value ? [Number(value)] : [])])].sort((x, y) => x - y);
  return (
    <div className="field" style={{ width: ancho }}>
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value ?? ""} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : "")}>
        {conTodos && <option value="">Todos los años</option>}
        {lista.map((x) => <option key={x} value={x}>{x}{x === actual ? " (este año)" : ""}</option>)}
      </select>
    </div>
  );
}
