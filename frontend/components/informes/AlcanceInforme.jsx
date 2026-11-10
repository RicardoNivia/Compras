"use client";

import { useEffect, useState } from "react";
import { fetchMaestros } from "@/lib/api";

// "Categoría: Imprevistos Administrativos (TIT) · Área: Administrativo", o null si el informe cubre todas las compras.
// (Mismo texto que backend/lib/reportContent.js#textoAlcance, que es el que sale en el PDF.)
export function textoAlcance(f) {
  const cats = f?.categorias || [];
  const areas = f?.areas || [];
  if (!cats.length && !areas.length) return null;
  return [cats.length ? `${cats.length > 1 ? "Categorías" : "Categoría"}: ${cats.join(", ")}` : null, areas.length ? `${areas.length > 1 ? "Áreas" : "Área"}: ${areas.join(", ")}` : null].filter(Boolean).join(" · ");
}

function Selector({ id, etiqueta, opciones, elegidos, onChange, vacio }) {
  const libres = opciones.filter((o) => !elegidos.includes(o));
  return (
    <div className="est-alcance-campo">
      <label htmlFor={id}>{etiqueta}</label>
      <div className="est-alcance-chips">
        {elegidos.length === 0 && <span className="est-alcance-todas">{vacio}</span>}
        {elegidos.map((v) => (
          <span key={v} className="est-alcance-chip" title={v}>
            <span>{v}</span>
            <button type="button" aria-label={`Quitar ${v}`} onClick={() => onChange(elegidos.filter((x) => x !== v))}>×</button>
          </span>
        ))}
      </div>
      <select id={id} value="" onChange={(e) => e.target.value && onChange([...elegidos, e.target.value])} disabled={!libres.length}>
        <option value="">{libres.length ? `+ Agregar ${etiqueta.toLowerCase().replace(/s$/, "")}…` : "No hay más"}</option>
        {libres.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

// Alcance del informe: limita TODO el informe (cifras, gráficas, tablas y secciones de Nova) a unas categorías y/o
// áreas. Vacío = todas las compras. Se guarda en informe.contexto.filtros.
export default function AlcanceInforme({ filtros, onChange }) {
  const [areas, setAreas] = useState([]);
  const [categorias, setCategorias] = useState([]);
  useEffect(() => {
    const nombres = (r) => [...new Set((r?.maestros || r || []).map((m) => m.valor).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
    fetchMaestros("area", true).then((r) => setAreas(nombres(r))).catch(() => {});
    fetchMaestros("categoria", true).then((r) => setCategorias(nombres(r))).catch(() => {});
  }, []);
  const f = { areas: filtros?.areas || [], categorias: filtros?.categorias || [] };
  const cambiar = (campo, lista) => {
    const nuevo = { ...f, [campo]: lista };
    onChange(nuevo.areas.length || nuevo.categorias.length ? nuevo : null);
  };
  const activo = f.areas.length || f.categorias.length;
  return (
    <div className={`est-alcance ${activo ? "activo" : ""}`}>
      <div className="est-alcance-cabeza">
        <span className="est-eyebrow">Alcance</span>
        {activo ? <button type="button" className="link-btn" onClick={() => onChange(null)}>Quitar filtro</button> : null}
      </div>
      <p className="muted">{activo ? "Todo el informe se calcula solo con estas compras." : "Limita todo el informe a unas categorías o áreas (por ejemplo, «Imprevistos Administrativos»)."}</p>
      <Selector id="alc-cat" etiqueta="Categorías" opciones={categorias} elegidos={f.categorias} onChange={(l) => cambiar("categorias", l)} vacio="Todas las categorías" />
      <Selector id="alc-area" etiqueta="Áreas" opciones={areas} elegidos={f.areas} onChange={(l) => cambiar("areas", l)} vacio="Todas las áreas" />
    </div>
  );
}
