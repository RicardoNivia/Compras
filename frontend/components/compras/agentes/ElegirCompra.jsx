"use client";

import { useEffect, useRef, useState } from "react";
import { buscarComprasAgenteApi } from "@/lib/api";
import { fmtCOP } from "@/lib/format";
import { IconSearch, IconTrash } from "@/components/icons";

// Buscador de una compra (por # o por texto) para los agentes de Compras. valor: { id, numero, descripcion, … } o null.
export default function ElegirCompra({ valor, onChange, placeholder = "Busca la compra por # o descripción…" }) {
  const [q, setQ] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [lista, setLista] = useState([]);
  const [cargando, setCargando] = useState(false);
  const caja = useRef(null);

  useEffect(() => {
    if (!abierto) return undefined;
    setCargando(true);
    const t = setTimeout(() => {
      buscarComprasAgenteApi(q).then((r) => setLista(r.compras || [])).catch(() => setLista([])).finally(() => setCargando(false));
    }, 250);
    return () => clearTimeout(t);
  }, [q, abierto]);

  useEffect(() => {
    const fuera = (e) => { if (caja.current && !caja.current.contains(e.target)) setAbierto(false); };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, []);

  if (valor) {
    return (
      <div className="ag-compra-elegida">
        <span className="mono">#{valor.numero ?? "—"}</span>
        <span className="ag-compra-desc" title={valor.descripcion}>{valor.descripcion || "Sin descripción"}</span>
        <span className="muted">{valor.proveedor || ""}{valor.valor != null ? ` · ${fmtCOP(valor.valor)}` : ""}</span>
        <button type="button" className="icon-action-btn" aria-label="Quitar la compra" onClick={() => onChange(null)}><IconTrash size={13} /></button>
      </div>
    );
  }

  return (
    <div className="ag-compra-buscar" ref={caja}>
      <label className="ag-buscar">
        <IconSearch size={15} />
        <input type="search" value={q} placeholder={placeholder} onFocus={() => setAbierto(true)} onChange={(e) => { setQ(e.target.value); setAbierto(true); }} aria-label="Buscar compra" />
      </label>
      {abierto && (
        <ul className="ag-compra-lista" role="listbox">
          {cargando && <li className="muted">Buscando…</li>}
          {!cargando && lista.length === 0 && <li className="muted">No hay compras que coincidan.</li>}
          {!cargando && lista.map((c) => (
            <li key={c.id}>
              <button type="button" role="option" aria-selected="false" onClick={() => { onChange(c); setAbierto(false); setQ(""); }}>
                <span className="mono">#{c.numero ?? "—"}</span>
                <span className="ag-compra-desc">{c.descripcion || "Sin descripción"}</span>
                <span className="muted">{c.proveedor || "Sin proveedor"} · {c.valor != null ? fmtCOP(c.valor) : "sin valor"} · {c.fecha || "sin fecha"}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
