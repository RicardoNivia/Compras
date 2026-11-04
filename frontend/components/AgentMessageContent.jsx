"use client";

import { useEffect, useState } from "react";
import { renderMarkdown, splitChartBlocks } from "@/lib/markdown";
import ChartFromSpec from "@/components/charts/ChartFromSpec";
import FotosEnChat from "@/components/FotosEnChat";

// Frases que rotan mientras se espera la respuesta — Nova puede estar
// ejecutando varias herramientas antes de responder (ver lib/agentTools.js),
// así que esto no pretende reflejar el paso exacto, solo dar la sensación de
// que algo está pasando en vez de un indicador fijo.
const THINKING_PHRASES = ["Pensando", "Analizando los datos", "Revisando compras", "Creando la respuesta", "Casi listo"];

// Texto que va rotando cada cierto tiempo mientras se espera — compartido
// entre AgenteChat.jsx y FloatingAgentChat.jsx para que ambos chats tengan
// la misma sensación de "está trabajando en esto" en vez de un simple spinner.
export function ThinkingLabel({ intervalMs = 1600 }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((v) => (v + 1) % THINKING_PHRASES.length), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return <span className="thinking-label">{THINKING_PHRASES[i]}…</span>;
}

// Renderiza una respuesta del Agente IA (markdown + bloques ```chart```) —
// compartido entre AgenteChat.jsx (chat completo) y FloatingAgentChat.jsx
// (widget flotante contextual), que muestran las respuestas exactamente igual.
export default function AssistantContent({ text }) {
  const parts = splitChartBlocks(text);
  return (
    <>
      {parts.map((part, i) =>
        part.type === "chart"
          ? <ChartFromSpec key={i} spec={part.spec} />
          : part.type === "fotos"
            ? <FotosEnChat key={i} spec={part.spec} />
            : <div key={i} className="chat-markdown">{renderMarkdown(part.text)}</div>
      )}
    </>
  );
}
