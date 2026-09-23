"use client";

import { useState } from "react";
import Tooltip from "@/components/Tooltip";
import { fmtCOP } from "@/lib/format";

const W = 720;
const H = 260;
const PAD_L = 60;
const PAD_R = 16;
const PAD_T = 20;
const PAD_B = 34;

// Gráfico de barras vertical simple: valor total por mes.
// data: [{ key, label, value, highlighted }]
export default function BarChartSvg({ data }) {
  const [tooltip, setTooltip] = useState(null);

  if (!data || data.length === 0) {
    return <div className="empty">No hay datos para graficar.</div>;
  }

  const maxVal = Math.max(1, ...data.map((d) => d.value));
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const bw = innerW / data.length;
  const gridLines = 4;

  function yFor(v) {
    return PAD_T + innerH - (v / maxVal) * innerH;
  }

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img">
        {Array.from({ length: gridLines + 1 }).map((_, i) => {
          const v = (maxVal / gridLines) * i;
          const y = yFor(v);
          return (
            <g key={i}>
              <line className="gridline" x1={PAD_L} x2={W - PAD_R} y1={y} y2={y} />
              <text className="axis-label" x={PAD_L - 6} y={y + 3} textAnchor="end">
                {fmtCOP(v)}
              </text>
            </g>
          );
        })}
        <line className="baseline" x1={PAD_L} x2={W - PAD_R} y1={PAD_T + innerH} y2={PAD_T + innerH} />

        {data.map((d, i) => {
          const x = PAD_L + i * bw + bw * 0.15;
          const barW = bw * 0.7;
          const y = yFor(d.value);
          const barH = PAD_T + innerH - y;
          const color = d.highlighted ? "var(--accent)" : "var(--s1)";
          const opacity = d.highlighted ? 1 : 0.62;
          return (
            <g key={d.key}>
              <rect
                className="mark"
                x={x} y={y} width={barW} height={Math.max(0, barH)}
                fill={color} opacity={opacity} rx="3"
                onMouseMove={(e) => setTooltip({
                  visible: true, x: e.clientX, y: e.clientY,
                  title: d.label, lines: [fmtCOP(d.value)],
                })}
                onMouseLeave={() => setTooltip(null)}
              />
              <text className="bar-total-label" x={x + barW / 2} y={y - 6} textAnchor="middle">
                {fmtCOP(d.value)}
              </text>
              <text className="axis-label" x={x + barW / 2} y={H - PAD_B + 16} textAnchor="middle">
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
      <Tooltip tooltip={tooltip} />
    </div>
  );
}
