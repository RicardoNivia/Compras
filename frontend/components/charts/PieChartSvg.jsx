"use client";

import { useState } from "react";
import Tooltip from "@/components/Tooltip";

const COLOR_VARS = ["--s1", "--s2", "--s3", "--s4", "--s5", "--sOther"];
const R = 76;
const CX = 90;
const CY = 90;

// Gráfico de participación (dona) — usado para vistas de un solo mes, donde
// un gráfico "por mes" no tiene sentido con una sola barra.
// data: [{ name, value }]
export default function PieChartSvg({ data, formatValue = (v) => String(v), colors }) {
  const [tooltip, setTooltip] = useState(null);
  const rows = (data || []).filter((d) => d.value > 0);
  const total = rows.reduce((s, d) => s + d.value, 0);
  const palette = colors || COLOR_VARS.map((v) => `var(${v})`);

  if (!rows.length || total <= 0) {
    return <div className="empty">No hay datos para graficar.</div>;
  }

  // Una sola porción al 100% no se puede dibujar como arco (el punto de inicio
  // y fin coinciden), así que ese caso se pinta como círculo completo.
  const isFullCircle = rows.length === 1;

  let angle = -Math.PI / 2;
  const slices = rows.map((d, i) => {
    const frac = d.value / total;
    const a0 = angle;
    const a1 = angle + frac * Math.PI * 2;
    angle = a1;
    const x0 = CX + R * Math.cos(a0), y0 = CY + R * Math.sin(a0);
    const x1 = CX + R * Math.cos(a1), y1 = CY + R * Math.sin(a1);
    const large = a1 - a0 > Math.PI ? 1 : 0;
    return { ...d, path: `M${CX},${CY} L${x0},${y0} A${R},${R} 0 ${large} 1 ${x1},${y1} Z`, pct: frac * 100, color: palette[i % palette.length] };
  });

  return (
    <div className="chart-wrap" style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
      <svg viewBox="0 0 180 180" width="180" height="180" role="img">
        {slices.map((s, i) => (
          isFullCircle ? (
            <circle
              key={i} cx={CX} cy={CY} r={R} fill={s.color} opacity="0.92"
              onMouseMove={(e) => setTooltip({
                visible: true, x: e.clientX, y: e.clientY,
                title: s.name, lines: [`${formatValue(s.value)} · ${s.pct.toFixed(0)}%`],
              })}
              onMouseLeave={() => setTooltip(null)}
              style={{ cursor: "pointer" }}
            />
          ) : (
            <path
              key={i} d={s.path} fill={s.color} opacity="0.92"
              onMouseMove={(e) => setTooltip({
                visible: true, x: e.clientX, y: e.clientY,
                title: s.name, lines: [`${formatValue(s.value)} · ${s.pct.toFixed(0)}%`],
              })}
              onMouseLeave={() => setTooltip(null)}
              style={{ cursor: "pointer" }}
            />
          )
        ))}
      </svg>
      <div className="legend" style={{ flexDirection: "column", alignItems: "flex-start", gap: 8 }}>
        {slices.map((s, i) => (
          <span key={i} className="chip">
            <span className="swatch" style={{ background: s.color }} />
            {s.name} — {formatValue(s.value)} ({s.pct.toFixed(0)}%)
          </span>
        ))}
      </div>
      <Tooltip tooltip={tooltip} />
    </div>
  );
}
