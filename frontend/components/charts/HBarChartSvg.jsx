"use client";

import { useState } from "react";
import Tooltip from "@/components/Tooltip";
import { fmtCOP, fmtCompact } from "@/lib/format";
import { stagger, tween, useMorph, useProgress, useReveal, useUid } from "./chartKit";

const W = 720;
const ROW = 38;
const PAD_T = 6;
const LABEL_W = 230;
const VALUE_W = 110;

// Barras horizontales (rankings: costo por asistente, gasto por categoría…), con el mismo lenguaje que BarChartSvg:
// crecen en cascada al entrar en pantalla, la cifra cuenta hasta su valor, al pasar el cursor la fila se resalta y
// las demás se atenúan, y el tooltip muestra el valor exacto y el detalle.
// data: [{ key, label, value, detalle? }] — en el orden en que se quieren ver.
// formatValue: valor exacto (tooltip); formatLabel: cifra corta al final de la barra.
// color: variable de color del tema. onSelect(d): si se pasa, cada fila es clicable.
export default function HBarChartSvg({ data, formatValue = fmtCOP, formatLabel, color = "var(--accent)", onSelect }) {
  const corto = formatLabel || (formatValue === fmtCOP ? fmtCompact : formatValue);
  const [tooltip, setTooltip] = useState(null);
  const [hover, setHover] = useState(null);
  const [ref, shown] = useReveal();
  const uid = useUid();
  const p = useProgress(shown);
  const vals = useMorph((data || []).map((d) => d.value || 0));

  if (!data || data.length === 0) {
    return <div className="empty">No hay datos para graficar.</div>;
  }

  const H = PAD_T * 2 + data.length * ROW;
  const max = Math.max(1, ...vals);
  const barMax = W - LABEL_W - VALUE_W;

  return (
    <div className="chart-wrap" ref={ref}>
      <svg className="cx" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Ranking">
        <defs>
          <linearGradient id={`${uid}h`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" style={{ stopColor: color, stopOpacity: 0.6 }} />
            <stop offset="100%" style={{ stopColor: color, stopOpacity: 1 }} />
          </linearGradient>
        </defs>
        {data.map((d, i) => {
          const t = stagger(p, i, data.length);
          const val = vals[i] ?? 0;
          const y = PAD_T + i * ROW;
          const w = Math.max(2, (val / max) * barMax * t);
          const activa = hover === i;
          const atenuada = hover != null && !activa;
          const nombre = d.label.length > 34 ? `${d.label.slice(0, 33)}…` : d.label;
          return (
            <g
              key={d.key}
              className={onSelect ? "cx-clickable" : undefined}
              onClick={onSelect ? () => onSelect(d) : undefined}
              onMouseMove={(e) => {
                setHover(i);
                setTooltip({ visible: true, x: e.clientX, y: e.clientY, title: d.label, lines: [formatValue(d.value), ...(d.detalle ? [d.detalle] : []), ...(onSelect ? ["Clic para abrir"] : [])] });
              }}
              onMouseLeave={() => { setHover(null); setTooltip(null); }}
            >
              <rect x="0" y={y + 2} width={W} height={ROW - 4} rx="8" fill={color} className="cx-band" style={{ opacity: activa ? 0.07 : 0 }} />
              <text className="bar-name-label" x={LABEL_W - 12} y={y + ROW / 2 + 4} textAnchor="end" style={{ opacity: Math.min(1, p * 2.5) * (atenuada ? 0.5 : 1) }}>{nombre}</text>
              <rect x={LABEL_W} y={y + 9} width={barMax} height={ROW - 18} rx={(ROW - 18) / 2} fill="var(--surface-2)" />
              <rect
                className="cx-bar" x={LABEL_W} y={y + 9} width={w} height={ROW - 18} rx={(ROW - 18) / 2} fill={`url(#${uid}h)`}
                style={{ opacity: atenuada ? 0.35 : 1, filter: activa ? `drop-shadow(0 4px 8px color-mix(in srgb, ${color} 35%, transparent))` : "none" }}
              />
              <text className="bar-total-label" x={W - 4} y={y + ROW / 2 + 4} textAnchor="end" style={{ opacity: Math.max(0, (t - 0.4) / 0.6) * (atenuada ? 0.45 : 1), fontWeight: activa ? 800 : 600 }}>
                {corto(tween(Number.isInteger(d.value) ? Math.round(val) : val, t))}
              </text>
            </g>
          );
        })}
      </svg>
      <Tooltip tooltip={tooltip} />
    </div>
  );
}
