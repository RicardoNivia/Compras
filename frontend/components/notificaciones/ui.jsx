"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { IconTable, IconBuilding, IconMoney, IconBell, IconClock, IconCalendar, IconInbox } from "@/components/icons";

// Los modales se dibujan en <body>: si quedan dentro de un contenedor con animación o transform, el
// position:fixed del fondo se recorta a ese contenedor en lugar de cubrir toda la pantalla.
export function Portal({ children }) {
  const [listo, setListo] = useState(false);
  useEffect(() => setListo(true), []);
  return listo ? createPortal(children, document.body) : null;
}
import { FUENTES } from "@/lib/notificacionesCatalogo";

// Identidad visual por fuente de datos: ícono y color (tokens de globals.css).
export const FUENTE_VISUAL = {
  compras: { Icon: IconTable, color: "var(--accent)" },
  proveedores: { Icon: IconBuilding, color: "var(--secondary)" },
  presupuesto: { Icon: IconMoney, color: "var(--warning)" },
  bienestar: { Icon: IconCalendar, color: "#1e8a6e" },
  mi_dia: { Icon: IconBell, color: "var(--good)" },
  correo: { Icon: IconInbox, color: "var(--secondary)" }, // avisos del agente de correo (solicitudes de proveedor)
};

export function FuenteIcono({ fuente, size = 40 }) {
  const v = FUENTE_VISUAL[fuente] || FUENTE_VISUAL.compras;
  return (
    <span className="nx-fuente" style={{ "--fc": v.color, width: size, height: size }} title={FUENTES[fuente]?.label || ""}>
      <v.Icon size={Math.round(size * 0.45)} />
    </span>
  );
}

export function iniciales(nombre) {
  const p = String(nombre || "").trim().split(/\s+/).filter(Boolean);
  return p.length ? (p[0][0] + (p[1]?.[0] || "")).toUpperCase() : "?";
}

export function Avatares({ personas, max = 4 }) {
  const visibles = personas.slice(0, max);
  return (
    <span className="nx-avatares" title={personas.map((p) => p.nombre).join(", ")}>
      {visibles.map((p, i) => <span key={i} className={`nx-avatar${p.apagado ? " apagado" : ""}`}>{p.yo ? "Yo" : iniciales(p.nombre)}</span>)}
      {personas.length > max && <span className="nx-avatar mas">+{personas.length - max}</span>}
    </span>
  );
}

export function haceCuanto(iso) {
  if (!iso) return "";
  const seg = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seg < 60) return "hace un momento";
  const min = Math.round(seg / 60);
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  if (d === 1) return "ayer";
  if (d < 7) return `hace ${d} días`;
  return new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "short" });
}

export function grupoDia(iso) {
  const d = new Date(iso);
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const dia = new Date(d); dia.setHours(0, 0, 0, 0);
  const diff = Math.round((hoy - dia) / 86400000);
  if (diff === 0) return "Hoy";
  if (diff === 1) return "Ayer";
  if (diff < 7) return d.toLocaleDateString("es-CO", { weekday: "long" }).replace(/^./, (c) => c.toUpperCase());
  return d.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
}

export function Cuando({ texto }) {
  return <span className="nx-meta"><IconClock size={12} /> {texto}</span>;
}

export function Paginacion({ id, page, size, total, sizes, onPage, onSize, etiqueta }) {
  const totalPages = Math.max(1, Math.ceil(total / size));
  return (
    <div className="table-footer nx-footer">
      <div className="field" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <label htmlFor={id} style={{ marginBottom: 0 }}>Tamaño</label>
        <select id={id} value={size} onChange={(e) => onSize(Number(e.target.value))}>
          {sizes.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
      <div className="page-btns">
        <button type="button" className="btn small" disabled={page <= 1} onClick={() => onPage(page - 1)}>Anterior</button>
        <button type="button" className="btn small" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>Siguiente</button>
      </div>
      <span className="count-note">Página {Math.min(page, totalPages)} de {totalPages}</span>
      <div className="spacer" />
      <span className="count-note">{total} {etiqueta}</span>
    </div>
  );
}
