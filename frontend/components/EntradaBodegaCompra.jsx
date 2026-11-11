"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchBodegaApi, fetchEntradasCompraApi, entradaPorCompraApi } from "@/lib/api";

const num = (n) => Number(n || 0).toLocaleString("es-CO");
const fecha = (iso) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }) : "");

// Bloque del formulario de una compra (RecordModal): lo que llegó con esta compra a la bodega de Bienestar. Cada
// artículo que se agrega suma al stock como «entrada» enlazada a la compra, y queda en el historial del artículo.
// Solo en una compra ya guardada (necesita su número); se registra al instante, no al guardar el formulario.
export default function EntradaBodegaCompra({ recordId }) {
  const [entradas, setEntradas] = useState(null);
  const [articulos, setArticulos] = useState([]);
  const [articuloId, setArticuloId] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  const cargar = () => {
    if (!recordId) return;
    fetchEntradasCompraApi(recordId).then((r) => setEntradas(r.entradas)).catch(() => setEntradas([]));
  };
  useEffect(() => {
    cargar();
    fetchBodegaApi(true).then((r) => setArticulos(r.articulos)).catch(() => setArticulos([]));
  }, [recordId]); // eslint-disable-line react-hooks/exhaustive-deps

  const art = useMemo(() => articulos.find((a) => a.id === Number(articuloId)), [articulos, articuloId]);
  const c = Math.floor(Number(cantidad) || 0);

  async function agregar() {
    setError(""); setAviso("");
    if (!art) { setError("Elige el artículo que llegó."); return; }
    if (c <= 0) { setError("Escribe cuánto llegó."); return; }
    setGuardando(true);
    try {
      const r = await entradaPorCompraApi(recordId, { articuloId: art.id, cantidad: c });
      setAviso(`Entraron ${num(c)} a la bodega: ${r.articulo.producto} queda con ${num(r.articulo.stock)}.`);
      setArticuloId(""); setCantidad("");
      setArticulos((l) => l.map((a) => (a.id === r.articulo.id ? { ...a, stock: r.articulo.stock } : a)));
      cargar();
    } catch (err) {
      setError(err.message || "No se pudo registrar la entrada.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <details className="field full entrada-bodega" open={!!entradas?.length}>
      <summary>
        <span>¿Esta compra entra a la bodega de Bienestar?</span>
        <small>{entradas?.length ? `${entradas.length} artículo(s) ya entraron con esta compra` : "Opcional: si lo comprado se guarda en el inventario"}</small>
      </summary>
      {!recordId ? (
        <p className="count-note">Guarda primero la compra; luego, al editarla, aquí registras lo que llegó a la bodega.</p>
      ) : (
        <div className="entrada-bodega-cuerpo">
          <div className="entrada-bodega-fila">
            <div className="field entrada-bodega-art">
              <label htmlFor="eb-art">Artículo del inventario</label>
              <select id="eb-art" value={articuloId} onChange={(e) => { setArticuloId(e.target.value); setError(""); }}>
                <option value="">{articulos.length ? "Elige el artículo…" : "La bodega aún no tiene artículos"}</option>
                {articulos.map((a) => <option key={a.id} value={a.id}>{a.producto} — hay {num(a.stock)}{a.vence ? ` · vence ${fecha(a.vence)}` : ""}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="eb-cant">Cantidad que llegó</label>
              <input id="eb-cant" type="number" min="1" step="1" inputMode="numeric" className="entrada-bodega-num" value={cantidad} onChange={(e) => { setCantidad(e.target.value); setError(""); }} />
            </div>
            <button type="button" className="btn btn-primary" onClick={agregar} disabled={guardando}>{guardando && <span className="spinner" />} Agregar al inventario</button>
          </div>
          {art && c > 0 && <span className="count-note">{art.producto}: {num(art.stock)} → {num(art.stock + c)}</span>}
          {error && <div className="modal-error" role="alert">{error}</div>}
          {aviso && <div className="ficha-aviso" role="status">{aviso}</div>}
          {entradas?.length > 0 && (
            <ul className="entrada-bodega-lista">
              {entradas.map((m) => (
                <li key={m.id}><span>{m.articulo.producto}{m.articulo.vence ? ` · vence ${fecha(m.articulo.vence)}` : ""}</span><b>+{num(m.cantidad)}</b></li>
              ))}
            </ul>
          )}
          <span className="count-note">¿El artículo no existe? Créalo en Bienestar › Inventario y vuelve aquí. Si se equivocó, corríjalo con una salida en el inventario.</span>
        </div>
      )}
    </details>
  );
}
