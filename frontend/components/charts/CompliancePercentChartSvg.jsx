"use client";

import { useState } from "react";
import Tooltip from "@/components/Tooltip";

const W = 720;
const H = 240;
const PAD_L = 40;
const PAD_R = 16;
const PAD_T = 28;
const PAD_B = 44;

// Barras agrupadas de % cumplimiento vs % incumplimiento por mes (0-100%).
// data: [{ key, label, total, cumplioPct, incumplioPct, cumplioCount, incumplioCount }]
export default function CompliancePercentChartSvg({ data }) {
  const [tooltip, setTooltip] = useState(null);

  if (!data || data.length === 0) {
    return <div className="empty">No hay datos para graficar.</div>;
  }

  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const bw = innerW / data.length;
  const gridLines = 4;

  function yFor(pct) {
    return PAD_T + innerH - (pct / 100) * innerH;
  }

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img">
        {Array.from({ length: gridLines + 1 }).map((_, i) => {
          const v = (100 / gridLines) * i;
          const y = yFor(v);
          return (
            <g key={i}>
              <line className="gridline" x1={PAD_L} x2={W - PAD_R} y1={y} y2={y} />
              <text className="axis-label" x={PAD_L - 6} y={y + 3} textAnchor="end">{v}%</text>
            </g>
          );
        })}
        <line className="baseline" x1={PAD_L} x2={W - PAD_R} y1={PAD_T + innerH} y2={PAD_T + innerH} />

        {data.map((d) => {
          const groupW = bw * 0.62;
          const barW = groupW / 2 - 2;
          const gx = PAD_L + data.indexOf(d) * bw + (bw - groupW) / 2;

          const yc = yFor(d.cumplioPct);
          const yi = yFor(d.incumplioPct);

          return (
            <g key={d.key}>
              <rect
                className="mark"
                x={gx} y={yc} width={barW} height={Math.max(0, PAD_T + innerH - yc)}
                fill="var(--good)" opacity={d.total ? 0.85 : 0.25} rx="2"
                onMouseMove={(e) => setTooltip({
                  visible: true, x: e.clientX, y: e.clientY,
                  title: `${d.label} · Cumplió`,
                  lines: [`${d.cumplioPct.toFixed(0)}% (${d.cumplioCount} de ${d.total})`],
                })}
                onMouseLeave={() => setTooltip(null)}
              />
              {d.total > 0 && (
                <text className="bar-total-label" x={gx + barW / 2} y={yc - 6} textAnchor="middle" style={{ fill: "var(--good)" }}>
                  {d.cumplioPct.toFixed(0)}%
                </text>
              )}
              <rect
                className="mark"
                x={gx + barW + 4} y={yi} width={barW} height={Math.max(0, PAD_T + innerH - yi)}
                fill="var(--critical)" opacity={d.total ? 0.85 : 0.25} rx="2"
                onMouseMove={(e) => setTooltip({
                  visible: true, x: e.clientX, y: e.clientY,
                  title: `${d.label} · No cumplió`,
                  lines: [`${d.incumplioPct.toFixed(0)}% (${d.incumplioCount} de ${d.total})`],
                })}
                onMouseLeave={() => setTooltip(null)}
              />
              {d.total > 0 && d.incumplioCount > 0 && (
                <text className="bar-total-label" x={gx + barW + 4 + barW / 2} y={yi - 6} textAnchor="middle" style={{ fill: "var(--critical)" }}>
                  {d.incumplioPct.toFixed(0)}%
                </text>
              )}
              <text className="axis-label" x={gx + groupW / 2} y={H - PAD_B + 16} textAnchor="middle">
                {d.label}
              </text>
              <text className="axis-label" x={gx + groupW / 2} y={H - PAD_B + 28} textAnchor="middle" style={{ fontSize: 9.5, opacity: 0.75 }}>
                {d.cumplioCount}/{d.total}
              </text>
            </g>
          );
        })}
      </svg>
      <Tooltip tooltip={tooltip} />
    </div>
  );
}
