"use client";

import { useState } from "react";
import Tooltip from "@/components/Tooltip";
import { easeOutCubic, tween, useMorph, useProgress, useReveal } from "./chartKit";

const COLOR_VARS = ["--s1", "--s2", "--s3", "--s4", "--s5", "--sOther"];
const R = 78;
const R_IN = 52;
const CX = 90;
const CY = 90;
const GAP = 0.018; // separación entre porciones (radianes)
const POP = 7; // cuánto sale la porción resaltada

// Gráfico de participación (dona). Las porciones se dibujan en barrido horario al entrar en pantalla; al pasar
// el cursor (o por la leyenda) la porción sale ligeramente, las demás se atenúan y el centro muestra su detalle.
// data: [{ name, value }]
export default function PieChartSvg({ data, formatValue = (v) => String(v), colors }) {
  const [tooltip, setTooltip] = useState(null);
  const [hover, setHover] = useState(null);
  const [ref, shown] = useReveal();
  const todos = data || [];
  // Los ángulos usan el valor "en movimiento" (geo); los textos, el valor real.
  const vals = useMorph(todos.map((d) => d.value));
  const rows = todos.map((d, i) => ({ ...d, geo: vals[i] ?? 0 })).filter((d) => d.geo > 0.0005);
  const total = rows.reduce((s, d) => s + d.geo, 0);
  const totalReal = todos.reduce((s, d) => s + (d.value > 0 ? d.value : 0), 0);
  const palette = colors || COLOR_VARS.map((v) => `var(${v})`);
  const p = useProgress(shown, 1300);

  if (!rows.length || total <= 0) {
    return <div className="empty">No hay datos para graficar.</div>;
  }

  const barrido = easeOutCubic(p) * Math.PI * 2;
  const unica = rows.length === 1;
  const punto = (r, a) => [CX + r * Math.cos(a), CY + r * Math.sin(a)];

  let angle = -Math.PI / 2;
  const limite = -Math.PI / 2 + barrido;
  const slices = rows.map((d, i) => {
    const frac = d.geo / total;
    const ini = angle;
    const fin = angle + frac * Math.PI * 2;
    angle = fin;
    const g = unica ? 0 : GAP / 2;
    const a0 = ini + g;
    const a1 = Math.min(fin - g, unica ? ini + Math.PI * 2 - 0.0005 : fin - g, limite);
    let path = "";
    if (a1 > a0) {
      const [x0, y0] = punto(R, a0);
      const [x1, y1] = punto(R, a1);
      const [x2, y2] = punto(R_IN, a1);
      const [x3, y3] = punto(R_IN, a0);
      const large = a1 - a0 > Math.PI ? 1 : 0;
      path = `M${x0},${y0} A${R},${R} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${R_IN},${R_IN} 0 ${large} 0 ${x3},${y3} Z`;
    }
    const mid = (ini + fin) / 2;
    return { ...d, path, pct: frac * 100, color: palette[i % palette.length], dx: Math.cos(mid) * POP, dy: Math.sin(mid) * POP };
  });

  const activa = hover != null ? slices[hover] : null;
  const textoCentro = activa ? `${activa.pct.toFixed(0)}%` : String(formatValue(tween(totalReal, p)));
  const subCentro = activa ? activa.name : "Total";
  const fs = Math.min(activa ? 22 : 18, 150 / Math.max(3, textoCentro.length));
  const subCorto = subCentro.length > 16 ? `${subCentro.slice(0, 15)}…` : subCentro;

  return (
    <div className="chart-wrap" ref={ref} style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
      <svg className="cx" viewBox="0 0 180 180" width="180" height="180" role="img" style={{ overflow: "visible" }}>
        {slices.map((s, i) => {
          const esta = hover === i;
          return (
            <path
              key={i}
              className="cx-slice"
              d={s.path}
              fill={s.color}
              style={{
                opacity: hover != null && !esta ? 0.35 : 0.96,
                transform: esta ? `translate(${s.dx}px, ${s.dy}px)` : "translate(0, 0)",
                filter: esta ? "drop-shadow(0 4px 8px rgba(0,0,0,0.25))" : "none",
                cursor: "pointer",
              }}
              onMouseMove={(e) => {
                setHover(i);
                setTooltip({ visible: true, x: e.clientX, y: e.clientY, title: s.name, lines: [`${formatValue(s.value)} · ${s.pct.toFixed(0)}%`] });
              }}
              onMouseLeave={() => { setHover(null); setTooltip(null); }}
            />
          );
        })}
        <text x={CX} y={CY + fs * 0.1} textAnchor="middle" style={{ fontFamily: "Nunito, sans-serif", fontWeight: 800, fontSize: fs, fill: "var(--ink)", pointerEvents: "none" }}>
          {textoCentro}
        </text>
        <text x={CX} y={CY + fs * 0.1 + 14} textAnchor="middle" className="axis-label" style={{ pointerEvents: "none" }}>
          {subCorto}
        </text>
      </svg>
      <div className="legend" style={{ flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
        {slices.map((s, i) => (
          <span
            key={i}
            className={`chip chip-interactivo${hover != null && hover !== i ? " dim" : ""}${hover === i ? " on" : ""}`}
            style={{ opacity: Math.min(1, p * 3) }}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <span className="swatch" style={{ background: s.color }} />
            {s.name} — {formatValue(s.value)} ({s.pct.toFixed(0)}%)
          </span>
        ))}
      </div>
      <Tooltip tooltip={tooltip} />
    </div>
  );
}
