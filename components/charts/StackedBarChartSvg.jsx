"use client";

import { useState } from "react";
import Tooltip from "@/components/Tooltip";
import { fmtCompact } from "@/lib/format";

const W = 720;
const H = 280;
const PAD_L = 56;
const PAD_R = 16;
const PAD_T = 20;
const PAD_B = 34;

const SERIES_COLORS = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)", "var(--sOther)"];

// Barras apiladas por mes. data: [{ key, label, segments: [{ name, value }] }]
// seriesNames: orden fijo de las series (para colores consistentes).
export default function StackedBarChartSvg({ data, seriesNames }) {
  const [tooltip, setTooltip] = useState(null);

  if (!data || data.length === 0) {
    return <div className="empty">No hay datos para graficar.</div>;
  }

  const maxVal = Math.max(1, ...data.map((d) => d.segments.reduce((s, seg) => s + seg.value, 0)));
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
                {fmtCompact(v)}
              </text>
            </g>
          );
        })}
        <line className="baseline" x1={PAD_L} x2={W - PAD_R} y1={PAD_T + innerH} y2={PAD_T + innerH} />

        {data.map((d, i) => {
          const x = PAD_L + i * bw + bw * 0.15;
          const barW = bw * 0.7;
          let acc = 0;
          return (
            <g key={d.key}>
              {d.segments.map((seg, si) => {
                if (seg.value <= 0) return null;
                const y0 = yFor(acc);
                acc += seg.value;
                const y1 = yFor(acc);
                const color = SERIES_COLORS[seriesNames.indexOf(seg.name) % SERIES_COLORS.length];
                return (
                  <rect
                    key={seg.name}
                    className="mark"
                    x={x} y={y1} width={barW} height={Math.max(0, y0 - y1)}
                    fill={color}
                    onMouseMove={(e) => setTooltip({
                      visible: true, x: e.clientX, y: e.clientY,
                      title: `${d.label} · ${seg.name}`, lines: [fmtCompact(seg.value)],
                    })}
                    onMouseLeave={() => setTooltip(null)}
                  />
                );
              })}
              <text className="axis-label" x={x + barW / 2} y={H - PAD_B + 16} textAnchor="middle">
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
      <Tooltip tooltip={tooltip} />
      <div className="legend">
        {seriesNames.map((name, i) => (
          <span className="chip" key={name}>
            <span className="swatch" style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }} />
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}
