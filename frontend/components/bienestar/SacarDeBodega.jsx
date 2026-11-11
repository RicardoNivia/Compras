"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fetchBodegaApi, salidaBodegaApi } from "@/lib/api";
import MoneyInput from "@/components/MoneyInput";

const num = (n) => Number(n || 0).toLocaleString("es-CO");
const fecha = (iso) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" }) : "");

// Registrar lo que la actividad usó de la bodega de Bienestar (sección Inventario de su ficha): se elige el artículo y
// cuánto se usó —sin estimar antes— y eso se descuenta; nunca más de lo que hay (el campo lo dice y el servidor lo vuelve
// a validar). Queda como salida en el historial del artículo y como ítem de la actividad (cantidad = usado), que se
// corrige con el lápiz de la tabla.
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
    if (c <= 0) { setError("Escribe cuánto se usó."); return; }
    if (excede) return;
    setGuardando(true);
    try {
      const r = await salidaBodegaApi(actividadId, { articuloId: art.id, cantidad: c, costoUnitario: costo === "" ? null : Number(costo) });
      setArticuloId(""); setCantidad(""); setCosto("");
      onListo(`Se usaron ${num(c)} ${art.producto.toLowerCase()}: se descontaron de la bodega y quedan ${num(r.articulo.stock)}.`);
      cargar();
    } catch (err) {
      setError(err.message || "No se pudo registrar lo usado.");
      cargar();
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form className="sacar-bodega" onSubmit={sacar} noValidate>
      <div className="sacar-bodega-cab">
        <strong>Usado de la bodega</strong>
        <span className="count-note">Cuánto usó la actividad del <Link href="/bienestar/inventario">inventario de Bienestar</Link>: se descuenta de una vez y luego se corrige con el lápiz. No se puede usar más de lo que hay.</span>
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
          <label htmlFor="sb-cant">Cantidad usada{art ? ` (máx. ${num(art.stock)})` : ""}</label>
          <input id="sb-cant" type="number" min="1" max={art?.stock} step="1" inputMode="numeric" className="sacar-bodega-num" value={cantidad} onChange={(e) => { setCantidad(e.target.value); setError(""); }} aria-invalid={!!excede} />
        </div>
        <div className="field">
          <label htmlFor="sb-costo">Costo unitario <small>(opcional)</small></label>
          <MoneyInput id="sb-costo" prefix="$" value={costo} onChange={setCosto} decimales={2} style={{ width: 150 }} />
        </div>
        <button type="submit" className="btn btn-primary" disabled={guardando || !!excede}>{guardando && <span className="spinner" />} Descontar de la bodega</button>
      </div>
      {art && c > 0 && !excede && <span className="count-note">En la bodega quedarán {num(art.stock - c)}.</span>}
      {excede && <div className="modal-error" role="alert">No hay suficiente {art.producto.toLowerCase()}: hay {num(art.stock)}. Puedes registrar hasta {num(art.stock)}.</div>}
      {error && <div className="modal-error" role="alert">{error}</div>}
    </form>
  );
}
