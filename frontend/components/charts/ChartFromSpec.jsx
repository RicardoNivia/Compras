"use client";

import { useState } from "react";
import Tooltip from "@/components/Tooltip";
import PieChartSvg from "@/components/charts/PieChartSvg";
import { BarGradient, easeOutQuart, roundedTop, stagger, tween, useMorph, useProgress, useReveal, useUid } from "./chartKit";

const COLOR_VARS = ["--s1", "--s2", "--s3", "--s4", "--s5", "--sOther"];
const W = 480;
const H = 220;
const PAD_L = 44;
const PAD_R = 12;
const PAD_T = 16;
const PAD_B = 30;

function fmtValue(v) {
  if (typeof v !== "number") return String(v);
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 }).format(v);
}

// Curva suave que pasa por todos los puntos (Catmull-Rom convertida a Bézier).
function smoothPath(pts) {
  if (pts.length < 2) return "";
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`;
  }
  return d;
}

function BarOrLine({ spec, isLine }) {
  const [tooltip, setTooltip] = useState(null);
  const [hover, setHover] = useState(null);
  const [ref, shown] = useReveal();
  const uid = useUid();
  const labels = spec.labels || [];
  const series = (spec.series || []).slice(0, 6);
  const p = useProgress(shown);
  const nCols = Math.max(labels.length, 1);
  // Todos los valores (serie × columna) se deslizan al nuevo dato si el gráfico cambia.
  const flat = useMorph(series.flatMap((s) => labels.map((_, i) => Number(s.data?.[i]) || 0)));
  const vv = (si, i) => flat[si * labels.length + i] ?? 0;
  const maxVal = Math.max(1, ...flat);
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const n = Math.max(labels.length, 1);
  const groupW = innerW / n;
  const base = PAD_T + innerH;

  function yFor(v) {
    return PAD_T + innerH - (v / maxVal) * innerH;
  }
  const color = (si) => `var(${COLOR_VARS[si % COLOR_VARS.length]})`;
  const showTip = (e, titulo, valor) => setTooltip({ visible: true, x: e.clientX, y: e.clientY, title: titulo, lines: [valor] });

  return (
    <div ref={ref}>
      <svg className="cx" viewBox={`0 0 ${W} ${H}`} width="100%" role="img">
        <defs>
          {series.map((_, si) => <BarGradient key={si} id={`${uid}b${si}`} color={color(si)} top={1} bottom={0.62} />)}
          {series.map((_, si) => (
            <linearGradient key={`a${si}`} id={`${uid}a${si}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: color(si), stopOpacity: 0.32 }} />
              <stop offset="100%" style={{ stopColor: color(si), stopOpacity: 0 }} />
            </linearGradient>
          ))}
        </defs>

        {Array.from({ length: 4 }).map((_, i) => {
          const v = (maxVal / 3) * i;
          const y = yFor(v);
          return (
            <g key={i} style={{ opacity: Math.min(1, p * 3) }}>
              <line className="gridline" x1={PAD_L} x2={W - PAD_R} y1={y} y2={y} strokeDasharray={i === 0 ? undefined : "3 5"} />
              <text className="axis-label" x={PAD_L - 7} y={y + 3} textAnchor="end">{fmtValue(v)}</text>
            </g>
          );
        })}

        {isLine
          ? series.map((s, si) => {
              const pts = labels.map((_, i) => [PAD_L + groupW * i + groupW / 2, yFor(vv(si, i))]);
              const linea = smoothPath(pts);
              const area = pts.length > 1 ? `${linea} L${pts[pts.length - 1][0]},${base} L${pts[0][0]},${base} Z` : "";
              const draw = easeOutQuart(Math.min(1, p / 0.85));
              return (
                <g key={si}>
                  {area && <path d={area} fill={`url(#${uid}a${si})`} style={{ opacity: Math.max(0, (p - 0.45) / 0.55) }} />}
                  <path
                    d={linea} pathLength="1" fill="none" stroke={color(si)} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"
                    strokeDasharray="1" strokeDashoffset={1 - draw}
                    style={{ filter: `drop-shadow(0 3px 5px color-mix(in srgb, ${color(si)} 40%, transparent))` }}
                  />
                  {pts.map(([x, y], i) => {
                    const t = stagger(p, i, pts.length, 0.7);
                    const activo = hover === `${si}-${i}`;
                    return (
                      <circle
                        key={i} cx={x} cy={y} r={(activo ? 6.5 : 4) * t}
                        fill="var(--surface)" stroke={color(si)} strokeWidth="2.4" className="cx-dot"
                        onMouseMove={(e) => { setHover(`${si}-${i}`); showTip(e, `${labels[i] ?? ""}${series.length > 1 ? ` · ${s.name || `Serie ${si + 1}`}` : ""}`, fmtValue(Number(s.data[i]) || 0)); }}
                        onMouseLeave={() => { setHover(null); setTooltip(null); }}
                      />
                    );
                  })}
                </g>
              );
            })
          : labels.map((_, i) => {
              const t = stagger(p, i, n);
              const bw = (groupW * 0.64) / series.length;
              return (
                <g key={i}>
                  {series.map((s, si) => {
                    const v = vv(si, i);
                    const x = PAD_L + groupW * i + groupW * 0.18 + bw * si;
                    const h = (base - yFor(v)) * t;
                    const y = base - h;
                    const activa = hover === `${si}-${i}`;
                    return (
                      <g key={si}>
                        <path
                          className="cx-bar" d={roundedTop(x, y, Math.max(1, bw - 2), h, Math.min(5, bw / 2))}
                          fill={`url(#${uid}b${si})`}
                          style={{ opacity: hover && !activa ? 0.4 : 1, filter: activa ? `drop-shadow(0 5px 8px color-mix(in srgb, ${color(si)} 40%, transparent))` : "none" }}
                          onMouseMove={(e) => { setHover(`${si}-${i}`); showTip(e, `${labels[i] ?? ""}${series.length > 1 ? ` · ${s.name || `Serie ${si + 1}`}` : ""}`, fmtValue(v)); }}
                          onMouseLeave={() => { setHover(null); setTooltip(null); }}
                        />
                        {series.length === 1 && n <= 8 && (
                          <text className="bar-total-label" x={x + (bw - 2) / 2} y={y - 6} textAnchor="middle" style={{ opacity: Math.max(0, (t - 0.45) / 0.55) }}>
                            {fmtValue(tween(v, t))}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </g>
              );
            })}
        <line className="baseline" x1={PAD_L} x2={W - PAD_R} y1={base} y2={base} />

        {labels.map((l, i) => (
          <text key={i} className="axis-label" x={PAD_L + groupW * i + groupW / 2} y={H - PAD_B + 16} textAnchor="middle" style={{ opacity: Math.min(1, p * 2.5) }}>
            {String(l).length > 12 ? `${String(l).slice(0, 11)}…` : l}
          </text>
        ))}
      </svg>
      <Tooltip tooltip={tooltip} />
      {series.length > 1 && (
        <div className="legend">
          {series.map((s, si) => (
            <span className="chip" key={si}>
              <span className="swatch" style={{ background: color(si) }} />
              {s.name || `Serie ${si + 1}`}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Pie({ spec }) {
  const s = (spec.series || [])[0] || { data: [] };
  const labels = spec.labels || [];
  const data = labels.map((l, i) => ({ name: String(l), value: Number(s.data?.[i]) || 0 }));
  return <PieChartSvg data={data} formatValue={fmtValue} />;
}

export default function ChartFromSpec({ spec }) {
  if (!spec || !Array.isArray(spec.labels) || !Array.isArray(spec.series)) {
    return <div className="empty">No se pudo interpretar el gráfico generado.</div>;
  }
  return (
    <div className="card chat-chart-card">
      {spec.title && <h3>{spec.title}</h3>}
      <div className="chart-wrap">
        {spec.type === "pie" ? <Pie spec={spec} /> : <BarOrLine spec={spec} isLine={spec.type === "line"} />}
      </div>
    </div>
  );
}
