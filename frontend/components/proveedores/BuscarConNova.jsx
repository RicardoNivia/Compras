"use client";

import { useState } from "react";
import { directorioSearchFiltersWithAiApi } from "@/lib/api";
import { IconSpark } from "@/components/icons";

const ETIQUETAS = {
  q: "Texto",
  clasificacion: "Clasificación",
  estado: "Estado",
  criticidad: "Criticidad",
  area: "Área",
  checklist: "Checklist",
};

// Búsqueda en lenguaje natural para las tablas de proveedores (mismo formato que
// la de Registros). Nova traduce la frase a filtros exactos (ver
// backend/app/api/agent/proveedor-search-filters); nunca ejecuta nada por sí misma.
export default function BuscarConNova({ areas = [], onApply, onClear, placeholder }) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [aplicado, setAplicado] = useState(null);

  async function buscar(e) {
    e.preventDefault();
    if (!query.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const { filters } = await directorioSearchFiltersWithAiApi(query, { areas: areas.map((a) => a.valor) });
      onApply(filters || {}, areas);
      setAplicado(filters || {});
    } catch (err) {
      setError(err.message || "Nova no pudo interpretar la búsqueda.");
    } finally {
      setBusy(false);
    }
  }

  function limpiar() {
    setQuery("");
    setAplicado(null);
    setError("");
    onClear?.();
  }

  const chips = aplicado ? Object.entries(aplicado).filter(([, v]) => v !== null && v !== undefined && v !== "") : [];

  return (
    <form onSubmit={buscar} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <div className="field search-field" style={{ flex: 1 }}>
          <label htmlFor="prov-nova">Describe qué proveedores buscas</label>
          <input
            id="prov-nova"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder || "Ej.: críticos desactualizados de Infraestructura"}
          />
        </div>
        <button type="submit" className="btn btn-primary" style={{ alignSelf: "flex-end" }} disabled={!query.trim() || busy}>
          {busy ? <span className="spinner" /> : <IconSpark size={13} />} Buscar
        </button>
      </div>
      {error && <div className="modal-error">{error}</div>}
      {aplicado && !error && (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
          <span className="chip">Entendí:</span>
          {chips.length === 0 && <span className="chip">Sin filtros específicos</span>}
          {chips.map(([k, v]) => <span key={k} className="chip">{ETIQUETAS[k] || k}: {String(v)}</span>)}
          <button type="button" className="btn small" onClick={limpiar}>Quitar</button>
        </div>
      )}
    </form>
  );
}
