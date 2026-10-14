"use client";

import { useState } from "react";
import Tooltip from "@/components/Tooltip";
import { BarGradient, roundedTop, stagger, tween, useMorph, useProgress, useReveal, useUid } from "./chartKit";

const W = 720;
const H = 240;
const PAD_L = 40;
const PAD_R = 16;
const PAD_T = 28;
const PAD_B = 44;

// Barras agrupadas de % cumplimiento vs % incumplimiento por mes (0-100%). Crecen en cascada; al pasar el
// cursor por un mes se resalta y los demás se atenúan.
// data: [{ key, label, total, cumplioPct, incumplioPct, cumplioCount, incumplioCount }]
export default function CompliancePercentChartSvg({ data }) {
  const [tooltip, setTooltip] = useState(null);
  const [hover, setHover] = useState(null);
  const [ref, shown] = useReveal();
  const uid = useUid();
  const p = useProgress(shown);
  const vals = useMorph((data || []).flatMap((d) => [d.cumplioPct, d.incumplioPct]));

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
    <div className="chart-wrap" ref={ref}>
      <svg className="cx" viewBox={`0 0 ${W} ${H}`} width="100%" role="img">
        <defs>
          <BarGradient id={`${uid}g`} color="var(--good)" top={1} bottom={0.62} />
          <BarGradient id={`${uid}c`} color="var(--critical)" top={1} bottom={0.62} />
        </defs>

        {Array.from({ length: gridLines + 1 }).map((_, i) => {
          const v = (100 / gridLines) * i;
          const y = yFor(v);
          return (
            <g key={i} style={{ opacity: Math.min(1, p * 3) }}>
              <line className="gridline" x1={PAD_L} x2={W - PAD_R} y1={y} y2={y} strokeDasharray={i === 0 ? undefined : "3 5"} />
              <text className="axis-label" x={PAD_L - 8} y={y + 3} textAnchor="end">{v}%</text>
            </g>
          );
        })}

        {data.map((d, i) => {
          const groupW = bw * 0.62;
          const barW = groupW / 2 - 2;
          const gx = PAD_L + i * bw + (bw - groupW) / 2;
          const t = stagger(p, i, data.length);
          const activo = hover === i;
          const atenuado = hover != null && !activo;
          const fondo = d.total ? 1 : 0.35;

          const pc = vals[i * 2] ?? 0;
          const pi = vals[i * 2 + 1] ?? 0;
          const hc = (PAD_T + innerH - yFor(pc)) * t;
          const hi = (PAD_T + innerH - yFor(pi)) * t;
          const yc = PAD_T + innerH - hc;
          const yi = PAD_T + innerH - hi;

          return (
            <g key={d.key} style={{ opacity: atenuado ? 0.4 : 1, transition: "opacity .2s ease" }}>
              <rect
                x={PAD_L + i * bw + 2} y={PAD_T - 14} width={bw - 4} height={innerH + 14} rx="8"
                fill="var(--accent)" className="cx-band" style={{ opacity: activo ? 0.07 : 0 }}
              />
              <path
                className="cx-bar"
                d={roundedTop(gx, yc, barW, hc, Math.min(6, barW / 2))}
                fill={`url(#${uid}g)`} opacity={fondo}
                style={{ filter: activo ? "drop-shadow(0 5px 8px color-mix(in srgb, var(--good) 40%, transparent))" : "none" }}
                onMouseMove={(e) => {
                  setHover(i);
                  setTooltip({
                    visible: true, x: e.clientX, y: e.clientY, title: `${d.label} · Cumplió`,
                    lines: [`${d.cumplioPct.toFixed(0)}% (${d.cumplioCount} de ${d.total})`],
                  });
                }}
                onMouseLeave={() => { setHover(null); setTooltip(null); }}
              />
              {d.total > 0 && (
                <text className="bar-total-label" x={gx + barW / 2} y={yc - 7} textAnchor="middle" style={{ fill: "var(--good)", opacity: Math.max(0, (t - 0.45) / 0.55) }}>
                  {tween(Math.round(pc), t)}%
                </text>
              )}
              <path
                className="cx-bar"
                d={roundedTop(gx + barW + 4, yi, barW, hi, Math.min(6, barW / 2))}
                fill={`url(#${uid}c)`} opacity={fondo}
                style={{ filter: activo ? "drop-shadow(0 5px 8px color-mix(in srgb, var(--critical) 40%, transparent))" : "none" }}
                onMouseMove={(e) => {
                  setHover(i);
                  setTooltip({
                    visible: true, x: e.clientX, y: e.clientY, title: `${d.label} · No cumplió`,
                    lines: [`${d.incumplioPct.toFixed(0)}% (${d.incumplioCount} de ${d.total})`],
                  });
                }}
                onMouseLeave={() => { setHover(null); setTooltip(null); }}
              />
              {d.total > 0 && d.incumplioCount > 0 && (
                <text className="bar-total-label" x={gx + barW + 4 + barW / 2} y={yi - 7} textAnchor="middle" style={{ fill: "var(--critical)", opacity: Math.max(0, (t - 0.45) / 0.55) }}>
                  {tween(Math.round(pi), t)}%
                </text>
              )}
              <text className="axis-label" x={gx + groupW / 2} y={H - PAD_B + 17} textAnchor="middle" style={{ opacity: Math.min(1, p * 2.5), fontWeight: activo ? 700 : 400 }}>
                {d.label}
              </text>
              <text className="axis-label" x={gx + groupW / 2} y={H - PAD_B + 29} textAnchor="middle" style={{ fontSize: 9.5, opacity: Math.min(0.75, p * 2) }}>
                {d.cumplioCount}/{d.total}
              </text>
            </g>
          );
        })}
        <line className="baseline" x1={PAD_L} x2={W - PAD_R} y1={PAD_T + innerH} y2={PAD_T + innerH} />
      </svg>
      <Tooltip tooltip={tooltip} />
    </div>
  );
}
