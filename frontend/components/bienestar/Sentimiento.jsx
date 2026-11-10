"use client";

import { IconMano } from "@/components/icons";

export const SENTIMIENTO_LABELS = { positivo: "Positivo", neutro: "Neutro", negativo: "Negativo", no_aplica: "No aplica" };
const SENTIDO = { positivo: "arriba", neutro: "medio", negativo: "abajo" };

// La manito que Nova le pone a un comentario: arriba (positivo), al medio (neutro) o abajo (negativo); si el texto no
// dice nada de la actividad, N/A sin manito. Sin clasificar aún, deja el espacio vacío para que los textos queden alineados.
export function ManoSentimiento({ valor }) {
  if (valor === "no_aplica") return <span className="mano mano-na" title="No aplica: no opina sobre la actividad, según Nova">N/A</span>;
  if (!SENTIDO[valor]) return <span className="mano mano-pendiente" title="Nova aún no lo clasifica" aria-hidden="true" />;
  return (
    <span className={`mano mano-${valor}`} title={`${SENTIMIENTO_LABELS[valor]} según Nova`} role="img" aria-label={`${SENTIMIENTO_LABELS[valor]} según Nova`}>
      <IconMano sentido={SENTIDO[valor]} size={15} />
    </span>
  );
}

// Texto de un comentario en una celda de tabla, con su manito al lado y el texto completo al pasar el cursor.
export function ComentarioConMano({ texto, sentimiento }) {
  return (
    <span className="celda-mano">
      <ManoSentimiento valor={sentimiento} />
      <span className="desc-tooltip-wrap"><span className="desc-text">{texto}</span><span className="desc-tooltip-bubble">{texto}</span></span>
    </span>
  );
}
