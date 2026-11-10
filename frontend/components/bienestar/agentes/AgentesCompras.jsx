"use client";

import { useState } from "react";
import { crossfade } from "@/lib/crossfade";
import AgenteAsociador from "@/components/bienestar/agentes/AgenteAsociador";
import ComprasSugeridas from "@/components/bienestar/agentes/ComprasSugeridas";
import Cotizador from "@/components/bienestar/agentes/Cotizador";
import { IconLayers, IconBag, IconMoney, IconSpark, IconCheck } from "@/components/icons";

const AGENTES = [
  { k: "asociador", color: "verde", icono: <IconLayers size={22} />, titulo: "Asociar compras", nota: "Encuentra a qué actividad pertenece cada compra que quedó suelta", cuando: "Úsalo cuando hay compras de Bienestar sin actividad" },
  { k: "sugeridas", color: "azul", icono: <IconBag size={22} />, titulo: "Compras de una actividad", nota: "Arma la lista de compras con lo que se compró en actividades parecidas", cuando: "Úsalo al planear una actividad" },
  { k: "cotizador", color: "ambar", icono: <IconMoney size={22} />, titulo: "Cotizador", nota: "Lee las cotizaciones y arma el cuadro comparativo por ti", cuando: "Úsalo cuando tienes 2 o más cotizaciones" },
];

// Los tres agentes de Bienestar en una página. Ninguno guarda nada sin que una persona confirme.
export default function AgentesCompras({ tabInicial, actividadInicial }) {
  const [tab, setTab] = useState(AGENTES.some((a) => a.k === tabInicial) ? tabInicial : actividadInicial ? "sugeridas" : "asociador");
  return (
    <div className="agentes">
      <section className="ag-hero">
        <div className="ag-hero-txt">
          <span className="ag-hero-chip"><IconSpark size={13} /> Agentes de Nova</span>
          <h1>¿En qué te ayudo hoy?</h1>
          <p>Elige un agente. Nova hace el trabajo pesado y tú decides: <b>nada se guarda sin que lo confirmes.</b></p>
        </div>
        <div className="ag-hero-orbe" aria-hidden="true"><span /><span /><span /><IconSpark size={24} /></div>
      </section>

      <div className="ag-selector" role="tablist" aria-label="Agentes">
        {AGENTES.map((a) => (
          <button key={a.k} type="button" role="tab" aria-selected={tab === a.k} className={`ag-opcion ag-${a.color}`} onClick={() => crossfade(() => setTab(a.k))}>
            <span className="ag-icono" aria-hidden="true">{a.icono}</span>
            <span className="ag-opcion-txt">
              <strong>{a.titulo}</strong>
              <span>{a.nota}</span>
              <em>{a.cuando}</em>
            </span>
            <span className="ag-opcion-check" aria-hidden="true"><IconCheck size={13} /></span>
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
