import { renderMarkdown, splitChartBlocks } from "@/lib/markdown";
import ChartFromSpec from "@/components/charts/ChartFromSpec";

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
          : <div key={i} className="chat-markdown">{renderMarkdown(part.text)}</div>
      )}
    </>
  );
}
