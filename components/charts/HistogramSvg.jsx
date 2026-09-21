"use client";

import { useState } from "react";
import Tooltip from "@/components/Tooltip";

const W = 480;
const H = 200;
const PAD_L = 34;
const PAD_R = 12;
const PAD_T = 16;
const PAD_B = 30;

// Histograma de buckets de días. buckets: [{ label, count }]
export default function HistogramSvg({ buckets, maxDiasBucket }) {
  const [tooltip, setTooltip] = useState(null);

  if (!buckets || buckets.length === 0) {
    return <div className="empty">Sin datos suficientes.</div>;
  }

  const maxCount = Math.max(1, ...buckets.map((b) => b.count));
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const bw = innerW / buckets.length;
  const color = maxDiasBucket <= 8 ? "var(--good)" : "var(--critical)";

  function yFor(v) {
    return PAD_T + innerH - (v / maxCount) * innerH;
  }

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img">
        <line className="baseline" x1={PAD_L} x2={W - PAD_R} y1={PAD_T + innerH} y2={PAD_T + innerH} />
        {buckets.map((b, i) => {
          const x = PAD_L + i * bw + bw * 0.12;
          const barW = bw * 0.76;
          const y = yFor(b.count);
          const barH = PAD_T + innerH - y;
          return (
            <g key={b.label}>
              <rect
                className="mark"
                x={x} y={y} width={barW} height={Math.max(0, barH)}
                fill={color} opacity={0.78} rx="3"
                onMouseMove={(e) => setTooltip({
                  visible: true, x: e.clientX, y: e.clientY,
                  title: `${b.label} días`, lines: [`${b.count} solicitud(es)`],
                })}
                onMouseLeave={() => setTooltip(null)}
              />
              <text className="bar-value-label" x={x + barW / 2} y={y - 4} textAnchor="middle">
                {b.count}
              </text>
              <text className="axis-label" x={x + barW / 2} y={H - PAD_B + 14} textAnchor="middle">
                {b.label}
              </text>
            </g>
          );
        })}
      </svg>
      <Tooltip tooltip={tooltip} />
    </div>
  );
}
