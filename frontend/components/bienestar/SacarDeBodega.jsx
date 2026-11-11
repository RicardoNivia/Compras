"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fetchBodegaApi, salidaBodegaApi } from "@/lib/api";
import MoneyInput from "@/components/MoneyInput";

const num = (n) => Number(n || 0).toLocaleString("es-CO");
const fecha = (iso) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }) : "");

// Sacar artículos de la bodega de Bienestar para una actividad (sección Inventario de su ficha): se elige el artículo
// y cuánto se lleva; nunca más de lo que hay (el campo lo dice y el servidor lo vuelve a validar). Queda como salida
// en el historial del artículo y como ítem del inventario de la actividad, enlazado a la bodega.
export default function SacarDeBodega({ actividadId, onListo }) {
  const [articulos, setArticulos] = useState(null);
  const [articuloId, setArticuloId] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [costo, setCosto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const cargar = () => fetchBodegaApi(true).then((r) => setArticulos(r.articulos.filter((a) => a.stock > 0))).catch(() => setArticulos([]));
  useEffect(() => { cargar(); }, []);
  const art = useMemo(() => (articulos || []).find((a) => a.id === Number(articuloId)), [articulos, articuloId]);
  const c = Math.floor(Number(cantidad) || 0);
  const excede = art && c > art.stock;

  async function sacar(e) {
    e.preventDefault();
    setError("");
    if (!art) { setError("Elige el artículo de la bodega."); return; }
    if (c <= 0) { setError("Escribe cuánto se lleva la actividad."); return; }
    if (excede) return;
    setGuardando(true);
    try {
      const r = await salidaBodegaApi(actividadId, { articuloId: art.id, cantidad: c, costoUnitario: costo === "" ? null : Number(costo) });
      setArticuloId(""); setCantidad(""); setCosto("");
      onListo(`Salieron ${num(c)} ${art.producto.toLowerCase()} de la bodega: quedan ${num(r.articulo.stock)}.`);
      cargar();
    } catch (err) {
      setError(err.message || "No se pudo sacar de la bodega.");
      cargar();
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form className="sacar-bodega" onSubmit={sacar} noValidate>
      <div className="sacar-bodega-cab">
        <strong>Sacar de la bodega</strong>
        <span className="count-note">Lo que se lleva la actividad del <Link href="/bienestar/inventario">inventario de Bienestar</Link>. No se puede sacar más de lo que hay.</span>
      </div>
      <div className="sacar-bodega-fila">
        <div className="field sacar-bodega-art">
          <label htmlFor="sb-art">Artículo</label>
          <select id="sb-art" value={articuloId} onChange={(e) => { setArticuloId(e.target.value); setError(""); }} disabled={!articulos}>
            <option value="">{articulos ? (articulos.length ? "Elige un artículo…" : "La bodega no tiene artículos con stock") : "Cargando la bodega…"}</option>
            {(articulos || []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.producto} — hay {num(a.stock)}{a.vence ? ` · vence ${fecha(a.vence)}` : ""}{a.diasParaVencer != null && a.diasParaVencer < 0 ? " (vencido)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="sb-cant">Cantidad{art ? ` (máx. ${num(art.stock)})` : ""}</label>
          <input id="sb-cant" type="number" min="1" max={art?.stock} step="1" inputMode="numeric" className="sacar-bodega-num" value={cantidad} onChange={(e) => { setCantidad(e.target.value); setError(""); }} aria-invalid={!!excede} />
        </div>
        <div className="field">
          <label htmlFor="sb-costo">Costo unitario <small>(opcional)</small></label>
          <MoneyInput id="sb-costo" prefix="$" value={costo} onChange={setCosto} decimales={2} style={{ width: 150 }} />
        </div>
        <button type="submit" className="btn btn-primary" disabled={guardando || !!excede}>{guardando && <span className="spinner" />} Sacar de bodega</button>
      </div>
      {art && c > 0 && !excede && <span className="count-note">En la bodega quedarán {num(art.stock - c)}.</span>}
      {excede && <div className="modal-error" role="alert">No hay suficiente {art.producto.toLowerCase()}: hay {num(art.stock)}. Puedes sacar hasta {num(art.stock)}.</div>}
      {error && <div className="modal-error" role="alert">{error}</div>}
    </form>
  );
}
