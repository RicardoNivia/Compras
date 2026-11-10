"use client";

import { useState } from "react";
import { lecturaNovaApi } from "@/lib/api";
import { IconSpark } from "@/components/icons";

// Botón "Pedir lectura a Nova" (vigía y anomalías): solo a pedido; el servidor recalcula las cifras y Nova las explica.
export default function LecturaNova({ cuerpo, deshabilitado, titulo = "Lectura de Nova" }) {
  const [puntos, setPuntos] = useState(null);
  const [pensando, setPensando] = useState(false);
  const [error, setError] = useState("");
  async function pedir() {
    setError("");
    setPensando(true);
    try {
      setPuntos((await lecturaNovaApi(cuerpo)).puntos);
    } catch (e) {
      setError(e.message);
    } finally {
      setPensando(false);
    }
  }
  return (
    <div className="ag-recomendacion ag-lectura">
      <span className="ag-trabajando-orbe" aria-hidden="true"><IconSpark size={16} /></span>
      <div>
        <div className="ag-lectura-cabeza">
          <strong>{titulo}</strong>
          <button type="button" className="btn small" disabled={pensando || deshabilitado} onClick={pedir}>{pensando ? <><span className="spinner" /> Nova está leyendo…</> : puntos ? "Leer de nuevo" : "Pedir lectura a Nova"}</button>
        </div>
        {!puntos && !error && <p className="muted">Nova explica las cifras y propone qué hacer. Solo corre si lo pides.</p>}
        {error && <p className="agente-rojo">{error}</p>}
        {puntos && <ul>{puntos.map((p, i) => <li key={i}>{p}</li>)}</ul>}
      </div>
    </div>
  );
}
