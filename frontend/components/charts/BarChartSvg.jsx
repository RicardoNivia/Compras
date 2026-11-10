"use client";

import { useState } from "react";
import Tooltip from "@/components/Tooltip";
import { fmtCOP, fmtCompact } from "@/lib/format";
import { BarGradient, roundedTop, stagger, tween, useMorph, useProgress, useReveal, useUid } from "./chartKit";

const W = 720;
const H = 260;
const PAD_L = 60;
const PAD_R = 16;
const PAD_T = 24;
const PAD_B = 34;

// Gráfico de barras vertical: valor total por mes. Las barras crecen en cascada al entrar en pantalla, las
// cifras suben hasta su valor y al pasar el cursor la columna se resalta y las demás se atenúan.
// data: [{ key, label, value, highlighted }]
// formatValue: cómo mostrar cada valor (por defecto pesos; pasa (v) => String(v) para conteos).
// onSelect(d): si se pasa, hacer clic en una barra la selecciona (p. ej. para filtrar el Dashboard por ese mes).
// formatLabel: formato corto para el eje y las cifras sobre las barras (por defecto, pesos en forma compacta
// "$ 206,3 M" para que no se pisen); el tooltip siempre muestra el valor exacto con formatValue.
// promedio: muestra una línea punteada con el promedio de las barras (por defecto sí, con 3 o más).
export default function BarChartSvg({ data, formatValue = fmtCOP, formatLabel, onSelect, promedio }) {
  const corto = formatLabel || (formatValue === fmtCOP ? fmtCompact : formatValue);
  const [tooltip, setTooltip] = useState(null);
  const [hover, setHover] = useState(null);
  const [ref, shown] = useReveal();
  const uid = useUid();
  const p = useProgress(shown);
  const vals = useMorph((data || []).map((d) => d.value));

  if (!data || data.length === 0) {
    return <div className="empty">No hay datos para graficar.</div>;
  }

  const maxVal = Math.max(1, ...data.map((d, i) => vals[i] ?? 0));
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const bw = innerW / data.length;
  const gridLines = 4;
  const hayDestacada = data.some((d) => d.highlighted);
  const mostrarPromedio = (promedio ?? data.length >= 3) && data.length >= 2;
  const prom = data.reduce((s, _, i) => s + (vals[i] ?? 0), 0) / data.length;

  function yFor(v) {
    return PAD_T + innerH - (v / maxVal) * innerH;
  }

  return (
    <div className="chart-wrap" ref={ref}>
      <svg className="cx" viewBox={`0 0 ${W} ${H}`} width="100%" role="img">
        <defs>
          <BarGradient id={`${uid}n`} color="var(--s1)" top={hayDestacada ? 0.7 : 1} bottom={hayDestacada ? 0.38 : 0.62} />
          <BarGradient id={`${uid}a`} color="var(--accent)" top={1} bottom={0.7} />
        </defs>

        {Array.from({ length: gridLines + 1 }).map((_, i) => {
          const v = (maxVal / gridLines) * i;
          const y = yFor(v);
          return (
            <g key={i} style={{ opacity: Math.min(1, p * 3) }}>
              <line className="gridline" x1={PAD_L} x2={W - PAD_R} y1={y} y2={y} strokeDasharray={i === 0 ? undefined : "3 5"} />
              <text className="axis-label" x={PAD_L - 8} y={y + 3} textAnchor="end">{corto(v)}</text>
            </g>
          );
        })}

        {data.map((d, i) => {
          const x = PAD_L + i * bw + bw * 0.15;
          const barW = bw * 0.7;
          const t = stagger(p, i, data.length);
          const val = vals[i] ?? 0;
          const fullH = PAD_T + innerH - yFor(val);
          const h = fullH * t;
          const y = PAD_T + innerH - h;
          const activa = hover === i;
          const atenuada = hover != null && !activa;
          return (
            <g key={d.key}>
              <rect
                x={PAD_L + i * bw + 2} y={PAD_T - 6} width={bw - 4} height={innerH + 6} rx="8"
                fill="var(--accent)" className="cx-band" style={{ opacity: activa ? 0.07 : 0 }}
              />
              <path
                className={`cx-bar${onSelect ? " cx-clickable" : ""}`}
                d={roundedTop(x, y, barW, h, Math.min(7, barW / 2))}
                onClick={onSelect ? () => onSelect(d) : undefined}
                fill={`url(#${uid}${d.highlighted ? "a" : "n"})`}
                style={{
                  opacity: atenuada ? 0.35 : 1,
                  filter: activa ? "drop-shadow(0 6px 10px color-mix(in srgb, var(--accent) 35%, transparent))" : "none",
                }}
                onMouseMove={(e) => {
                  setHover(i);
                  setTooltip({ visible: true, x: e.clientX, y: e.clientY, title: d.label, lines: onSelect ? [`Valor exacto: ${formatValue(d.value)}`, "Clic para ver este mes"] : [`Valor exacto: ${formatValue(d.value)}`] });
                }}
                onMouseLeave={() => { setHover(null); setTooltip(null); }}
              />
              <text
                className="bar-total-label" x={x + barW / 2} y={y - 7} textAnchor="middle"
                style={{ opacity: Math.max(0, (t - 0.45) / 0.55) * (atenuada ? 0.45 : 1), fontWeight: activa ? 800 : 600 }}
              >
                {corto(tween(Number.isInteger(d.value) ? Math.round(val) : val, t))}
              </text>
              <text className="axis-label" x={x + barW / 2} y={H - PAD_B + 17} textAnchor="middle" style={{ opacity: Math.min(1, p * 2.5), fill: activa ? "var(--ink)" : undefined, fontWeight: activa ? 700 : 400 }}>
                {d.label}
              </text>
            </g>
          );
        })}
        <line className="baseline" x1={PAD_L} x2={W - PAD_R} y1={PAD_T + innerH} y2={PAD_T + innerH} />
        {mostrarPromedio && (
          <g style={{ opacity: Math.max(0, (p - 0.5) / 0.5), pointerEvents: "none" }}>
            <line x1={PAD_L} x2={PAD_L + (W - PAD_R - PAD_L) * Math.min(1, Math.max(0, (p - 0.4) / 0.6))} y1={yFor(prom)} y2={yFor(prom)} stroke="var(--warning)" strokeWidth="1.4" strokeDasharray="5 4" />
          </g>
        )}
      </svg>
      <Tooltip tooltip={tooltip} />
      {mostrarPromedio && (
        <div className="legend" style={{ marginTop: 4, opacity: Math.max(0, (p - 0.5) / 0.5) }}>
          <span className="chip" title={formatValue(Math.round(prom))}>
            <span className="swatch-promedio" /> Promedio mensual: {corto(Math.round(prom))}
          </span>
        </div>
      )}
    </div>
  );
}
