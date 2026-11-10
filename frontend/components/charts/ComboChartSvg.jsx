"use client";

import { useState } from "react";
import Tooltip from "@/components/Tooltip";
import { fmtCOP, fmtCompact } from "@/lib/format";
import { BarGradient, easeOutCubic, monotonePath, roundedTop, stagger, tween, useMorph, useProgress, useReveal, useUid } from "./chartKit";

const W = 1080;
const H = 300;
const PAD_L = 60;
const PAD_R = 46;
const PAD_T = 26;
const PAD_B = 34;

// Barras + línea en la misma gráfica, con dos ejes (izquierda: barras; derecha: línea). Mismo lenguaje que
// BarChartSvg: las barras crecen en cascada al entrar en pantalla, las cifras suben hasta su valor, la línea se
// dibuja de izquierda a derecha y sus puntos aparecen detrás; al pasar el cursor la columna se resalta y el
// tooltip muestra las dos series. El valor de cada barra sale al pasar el cursor: fijo se montaría sobre la línea.
// data: [{ key, label, bar, line }]
// barName / lineName: nombres de las series (leyenda y tooltip). formatBar / formatLine: formato exacto del tooltip.
// barColor / lineColor: variables de color del tema (por defecto --secondary y --accent).
export default function ComboChartSvg({
  data, barName, lineName, formatBar = fmtCOP, formatLine = (v) => Math.round(v).toLocaleString("es-CO"),
  barColor = "var(--secondary)", lineColor = "var(--accent)",
}) {
  const cortoBar = formatBar === fmtCOP ? fmtCompact : formatBar;
  const [tooltip, setTooltip] = useState(null);
  const [hover, setHover] = useState(null);
  const [ref, shown] = useReveal();
  const uid = useUid();
  const p = useProgress(shown, 1300);
  const bars = useMorph((data || []).map((d) => d.bar || 0));
  const lines = useMorph((data || []).map((d) => d.line || 0));

  if (!data || data.length === 0) {
    return <div className="empty">No hay datos para graficar.</div>;
  }

  const maxBar = Math.max(1, ...bars);
  const maxLine = Math.max(1, ...lines);
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const bw = innerW / data.length;
  const gridLines = 4;
  const yBar = (v) => PAD_T + innerH - (v / maxBar) * innerH;
  const yLine = (v) => PAD_T + innerH - (v / maxLine) * (innerH - 12);
  const xCentro = (i) => PAD_L + i * bw + bw / 2;
  const puntos = data.map((_, i) => [xCentro(i), yLine(lines[i] ?? 0)]);
  const trazo = Math.max(0, Math.min(1, (p - 0.25) / 0.75));

  function mostrar(e, i) {
    const d = data[i];
    setHover(i);
    setTooltip({ visible: true, x: e.clientX, y: e.clientY, title: d.label, lines: [`${barName}: ${formatBar(d.bar || 0)}`, `${lineName}: ${formatLine(d.line || 0)}`] });
  }

  return (
    <div className="chart-wrap" ref={ref}>
      <svg className="cx" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${barName} y ${lineName} por mes`}>
        <defs>
          <BarGradient id={`${uid}b`} color={barColor} top={0.95} bottom={0.55} />
        </defs>

        {Array.from({ length: gridLines + 1 }).map((_, i) => {
          const y = PAD_T + innerH - (innerH / gridLines) * i;
          return (
            <g key={i} style={{ opacity: Math.min(1, p * 3) }}>
              <line className="gridline" x1={PAD_L} x2={W - PAD_R} y1={y} y2={y} strokeDasharray={i === 0 ? undefined : "3 5"} />
              <text className="axis-label" x={PAD_L - 8} y={y + 3} textAnchor="end">{cortoBar((maxBar / gridLines) * i)}</text>
              <text className="axis-label" x={W - PAD_R + 8} y={y + 3} textAnchor="start">{Math.round((maxLine / gridLines) * i * ((innerH - 12) / innerH)).toLocaleString("es-CO")}</text>
            </g>
          );
        })}

        {data.map((d, i) => {
          const x = PAD_L + i * bw + bw * 0.22;
          const barW = bw * 0.56;
          const t = stagger(p, i, data.length);
          const val = bars[i] ?? 0;
          const h = (PAD_T + innerH - yBar(val)) * t;
          const y = PAD_T + innerH - h;
          const activa = hover === i;
          const atenuada = hover != null && !activa;
          return (
            <g key={d.key}>
              <rect x={PAD_L + i * bw + 2} y={PAD_T - 6} width={bw - 4} height={innerH + 6} rx="8" fill={lineColor} className="cx-band" style={{ opacity: activa ? 0.07 : 0 }} />
              {val > 0 && (
                <path
                  className="cx-bar"
                  d={roundedTop(x, y, barW, h, Math.min(7, barW / 2))}
                  fill={`url(#${uid}b)`}
                  style={{ opacity: atenuada ? 0.35 : 1, filter: activa ? `drop-shadow(0 6px 10px color-mix(in srgb, ${barColor} 35%, transparent))` : "none" }}
                />
              )}
              {val > 0 && activa && (
                <text className="bar-total-label" x={x + barW / 2} y={y - 7} textAnchor="middle" style={{ opacity: Math.max(0, (t - 0.45) / 0.55) * (atenuada ? 0.45 : 1), fontWeight: activa ? 800 : 600 }}>
                  {formatBar(tween(val, t))}
                </text>
              )}
              <text className="axis-label" x={xCentro(i)} y={H - PAD_B + 17} textAnchor="middle" style={{ opacity: Math.min(1, p * 2.5), fill: activa ? "var(--ink)" : undefined, fontWeight: activa ? 700 : 400 }}>
                {d.label}
              </text>
            </g>
          );
        })}

        <line className="baseline" x1={PAD_L} x2={W - PAD_R} y1={PAD_T + innerH} y2={PAD_T + innerH} />

        <path d={monotonePath(puntos)} fill="none" stroke={lineColor} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" pathLength="1" strokeDasharray="1" strokeDashoffset={1 - easeOutCubic(trazo)} style={{ pointerEvents: "none" }} />
        {puntos.map(([x, y], i) => {
          const t = Math.max(0, Math.min(1, (trazo * data.length - i) * 1.2));
          const activa = hover === i;
          return (
            <g key={data[i].key} style={{ opacity: t, pointerEvents: "none" }}>
              <circle cx={x} cy={y} r={activa ? 6.5 : 4.5} fill="var(--surface)" stroke={lineColor} strokeWidth="3" style={{ transition: "r .15s ease" }} />
              {(data[i].line || 0) > 0 && (
                <text x={x} y={y - 11} textAnchor="middle" className="cx-line-label" style={{ fill: lineColor, fontWeight: activa ? 800 : 700 }}>
                  {formatLine(tween(lines[i] ?? 0, t))}
                </text>
              )}
            </g>
          );
        })}

        {data.map((d, i) => (
          <rect
            key={`hit-${d.key}`} x={PAD_L + i * bw} y={PAD_T - 6} width={bw} height={innerH + 6} fill="transparent"
            onMouseMove={(e) => mostrar(e, i)} onMouseLeave={() => { setHover(null); setTooltip(null); }}
          />
        ))}
      </svg>
      <Tooltip tooltip={tooltip} />
      <div className="legend" style={{ marginTop: 4, opacity: Math.min(1, p * 2) }}>
        <span className="chip"><span className="swatch" style={{ background: barColor }} /> {barName}</span>
        <span className="chip"><span className="swatch-linea" style={{ background: lineColor }} /> {lineName}</span>
      </div>
    </div>
  );
}
