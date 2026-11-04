"use client";

import { useState } from "react";
import { crossfade } from "@/lib/crossfade";
import AgenteAsociador from "@/components/bienestar/agentes/AgenteAsociador";
import ComprasSugeridas from "@/components/bienestar/agentes/ComprasSugeridas";
import Cotizador from "@/components/bienestar/agentes/Cotizador";

const PESTANAS = [
  ["asociador", "Asociar compras", "Propone a qué actividad pertenece cada compra del área sin actividad"],
  ["sugeridas", "Compras de una actividad", "Arma la lista de compras con lo que se compró en actividades parecidas"],
  ["cotizador", "Cotizador", "Lee las cotizaciones y arma el cuadro comparativo"],
];

// Los tres agentes de compras de Bienestar en una página. Ninguno guarda nada sin que una persona confirme.
export default function AgentesCompras({ tabInicial, actividadInicial }) {
  const [tab, setTab] = useState(PESTANAS.some(([k]) => k === tabInicial) ? tabInicial : actividadInicial ? "sugeridas" : "asociador");
  return (
    <div className="agentes">
      <div className="agentes-tabs" role="tablist" aria-label="Agentes de compras">
        {PESTANAS.map(([k, titulo, nota]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className="agentes-tab" onClick={() => crossfade(() => setTab(k))}>
            <strong>{titulo}</strong>
            <span>{nota}</span>
          </button>
        ))}
      </div>
      <div data-crossfade>
        {tab === "asociador" && <AgenteAsociador />}
        {tab === "sugeridas" && <ComprasSugeridas actividadInicial={actividadInicial} />}
        {tab === "cotizador" && <Cotizador />}
      </div>
    </div>
  );
}
