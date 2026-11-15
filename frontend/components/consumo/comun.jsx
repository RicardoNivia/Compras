"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { conMaestros } from "@/lib/consumoApi";
import { Portal } from "@/components/notificaciones/ui";

// Piezas comunes de Consumo, con la línea de diseño de la app (tarjetas, píldoras, modales y tablas de globals.css).
// Cada servicio lleva siempre su color (--c-<servicio> del tema de Consumo), su nombre y su unidad: nunca solo el color.

export const SERVICIOS = {
  energia: { nombre: "Energía", corto: "Energía", unidad: "kWh" },
  acueducto: { nombre: "Acueducto y alcantarillado", corto: "Acueducto", unidad: "m³" },
  gas: { nombre: "Gas natural", corto: "Gas", unidad: "m³" },
  aseo: { nombre: "Aseo", corto: "Aseo", unidad: null },
};
export const ORDEN_SERVICIOS = ["energia", "acueducto", "gas", "aseo"];
export const PERIODICIDADES = { mensual: "Mensual", bimestral: "Bimestral" };

// Cuadro de color de un servicio (decorativo: el nombre siempre va al lado). apagado = la sede no tiene ese servicio.
export function PuntoServicio({ servicio, apagado = false, titulo }) {
  return <span className={`con-punto${apagado ? " apagado" : ""}`} style={apagado ? undefined : { background: `var(--c-${servicio})` }} title={titulo} aria-hidden="true" />;
}

export function EtiquetaServicio({ servicio, corto = false }) {
  const s = SERVICIOS[servicio];
  return <span className="con-servicio"><PuntoServicio servicio={servicio} />{corto ? s?.corto : s?.nombre || servicio}</span>;
}

// Catálogo del módulo (sedes con sus cuentas y medidores, empresas) con recarga.
export function useCatalogosConsumo() {
  const [cat, setCat] = useState(null);
  const [error, setError] = useState("");
  const cargar = useCallback(() => conMaestros().then((r) => { setCat(r); setError(""); return r; }).catch((e) => { setError(e.message); return null; }), []);
  useEffect(() => { cargar(); }, [cargar]);
  return { cat, error, recargar: cargar };
}

export function Aviso({ texto, onCerrar }) {
  useEffect(() => { if (!texto) return undefined; const t = setTimeout(onCerrar, 4500); return () => clearTimeout(t); }, [texto, onCerrar]);
  return texto ? <div className="toast toast-good" role="status">{texto}</div> : null;
}

// Modal con el diseño de la app y el tema de Consumo (se dibuja en <body>, por eso lleva .con-tema).
// Con un modal encima de otro, Escape cierra solo el de arriba.
export function Modal({ titulo, sub, onClose, ancho = 640, children, pie, onSubmit }) {
  const overlay = useRef(null);
  useEffect(() => {
    const k = (e) => { if (e.key !== "Escape") return; const todos = document.querySelectorAll(".modal-overlay"); if (overlay.current && todos[todos.length - 1] !== overlay.current) return; onClose(); };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onClose]);
  const Caja = onSubmit ? "form" : "div";
  return (
    <Portal>
      <div ref={overlay} className="modal-overlay con-tema" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <Caja className="modal" role="dialog" aria-modal="true" aria-label={titulo} style={{ maxWidth: ancho, width: "100%" }} onSubmit={onSubmit}>
          <div className="modal-head">
            <div style={{ minWidth: 0 }}>
              <h3 style={{ margin: 0 }}>{titulo}</h3>
              {sub && <span className="card-sub">{sub}</span>}
            </div>
            <button type="button" className="btn-ghost icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
          </div>
          <div className="modal-body">{children}</div>
          {pie && <div className="modal-foot">{pie}</div>}
        </Caja>
      </div>
    </Portal>
  );
}

// Interruptor con el texto primero y el control después (regla de la app).
export function Interruptor({ id, texto, ayuda, checked, onChange, disabled }) {
  return (
    <label className="con-interruptor" htmlFor={id}>
      <span><strong>{texto}</strong>{ayuda && <small>{ayuda}</small>}</span>
      <span className="toggle-switch">
        <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} disabled={disabled} />
        <span className="toggle-track"><span className="toggle-thumb" /></span>
      </span>
    </label>
  );
}

export const fechaHora = (iso) => (iso ? new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" }) : "—");
export const creadoPor = (x) => `Creado por ${x?.creadoPorNombre || "—"} · ${fechaHora(x?.createdAt)}`;

// ---------- Recibos: etiquetas y formato de cifras ----------
export const TIPOS_LECTURA = { real: "Real", promediada: "Promediada", estimada: "Estimada", sin_consumo: "Sin consumo" };
export const ESTADOS_PAGO = { pendiente: "Por pagar", pagado: "Pagado", saldo_favor: "Saldo a favor" };
export const GRUPOS_CARGO = { energia: "Energía", acueducto: "Acueducto", alcantarillado: "Alcantarillado", gas: "Gas", aseo: "Aseo", otros: "Otros cobros", financiado: "Financiado" };
// Grupo por defecto de un cargo nuevo según el servicio del recibo.
export const GRUPO_DE_SERVICIO = { energia: "energia", acueducto: "acueducto", gas: "gas", aseo: "aseo" };
export const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
export const hoyCO = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
export const fechaCorta = (f) => (f ? new Date(`${f}T12:00:00`).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" }) : "—");

// Número con separador de miles y coma decimal (es-CO): 4.280 · 27,4 · 825,97.
export const fmtNum = (v, dec = 2) => (v == null || Number.isNaN(Number(v)) ? "—" : new Intl.NumberFormat("es-CO", { maximumFractionDigits: dec }).format(Number(v)));
export const fmtConsumo = (v, unidad) => (v == null ? "—" : `${fmtNum(v, 2)}${unidad ? ` ${unidad === "m3" ? "m³" : unidad}` : ""}`);
// Variación en porcentaje con signo: +3,4 % · −7,6 %.
export const fmtVar = (v) => (v == null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${fmtNum(Math.abs(v) * 100, 1)} %`);
// Sube el costo = rojo; baja = verde; sin dato o cero = neutro.
export const claseVar = (v) => (v == null || Math.abs(v) < 0.0005 ? "muted" : v > 0 ? "con-sube" : "con-baja");

export function PildoraPago({ recibo }) {
  if (recibo.vencido) return <span className="pill critical">Vencido</span>;
  const cls = { pendiente: "warning", pagado: "good", saldo_favor: "secondary" }[recibo.estadoPago] || "muted";
  return <span className={`pill ${cls}`}>{ESTADOS_PAGO[recibo.estadoPago] || recibo.estadoPago}</span>;
}
export function PildoraLectura({ tipo }) {
  return <span className={`pill ${tipo === "promediada" || tipo === "estimada" ? "accent" : "muted"}`}>{TIPOS_LECTURA[tipo] || tipo}</span>;
}
