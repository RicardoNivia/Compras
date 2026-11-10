"use client";

import { useState } from "react";
import Tooltip from "@/components/Tooltip";
import { fmtCompact } from "@/lib/format";
import { BarGradient, roundedTop, stagger, useMorph, useProgress, useReveal, useUid } from "./chartKit";

const W = 720;
const H = 280;
const PAD_L = 56;
const PAD_R = 16;
const PAD_T = 20;
const PAD_B = 34;

const SERIES_COLORS = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)", "var(--sOther)"];

// Barras apiladas por mes. Cada pila crece en cascada; al pasar el cursor por un segmento o por un elemento
// de la leyenda, esa serie se resalta y las demás se atenúan.
// data: [{ key, label, segments: [{ name, value }] }]
// seriesNames: orden fijo de las series (para colores consistentes).
// formatValue: por defecto valores compactos de dinero; pasa (v) => String(v) para conteos.
export default function StackedBarChartSvg({ data, seriesNames, formatValue = fmtCompact }) {
  const [tooltip, setTooltip] = useState(null);
  const [serie, setSerie] = useState(null);
  const [ref, shown] = useReveal();
  const uid = useUid();
  const p = useProgress(shown);
  // Cada (mes, serie) es un número que se desliza al nuevo valor cuando cambian los datos.
  const nombres = [...new Set([...(seriesNames || []), ...(data || []).flatMap((d) => d.segments.map((s) => s.name))])];
  const vals = useMorph((data || []).flatMap((d) => nombres.map((n) => d.segments.find((s) => s.name === n)?.value || 0)));
  const valDe = (i, name) => vals[i * nombres.length + nombres.indexOf(name)] ?? 0;

  if (!data || data.length === 0) {
    return <div className="empty">No hay datos para graficar.</div>;
  }

  const maxVal = Math.max(1, ...data.map((_, i) => nombres.reduce((s, n) => s + valDe(i, n), 0)));
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const bw = innerW / data.length;
  const gridLines = 4;

  function yFor(v) {
    return PAD_T + innerH - (v / maxVal) * innerH;
  }

  return (
    <div className="chart-wrap" ref={ref}>
      <svg className="cx" viewBox={`0 0 ${W} ${H}`} width="100%" role="img">
        <defs>
          {SERIES_COLORS.map((c, i) => <BarGradient key={i} id={`${uid}s${i}`} color={c} top={1} bottom={0.78} />)}
        </defs>

        {Array.from({ length: gridLines + 1 }).map((_, i) => {
          const v = (maxVal / gridLines) * i;
          const y = yFor(v);
          return (
            <g key={i} style={{ opacity: Math.min(1, p * 3) }}>
              <line className="gridline" x1={PAD_L} x2={W - PAD_R} y1={y} y2={y} strokeDasharray={i === 0 ? undefined : "3 5"} />
              <text className="axis-label" x={PAD_L - 8} y={y + 3} textAnchor="end">{formatValue(v)}</text>
            </g>
          );
        })}

        {data.map((d, i) => {
          const x = PAD_L + i * bw + bw * 0.15;
          const barW = bw * 0.7;
          const t = stagger(p, i, data.length);
          const orden = [...d.segments.map((s) => s.name), ...nombres.filter((n) => !d.segments.some((s) => s.name === n))];
          const visibles = orden.map((name) => ({ name, value: valDe(i, name) })).filter((s) => s.value > 0.0005);
          let acc = 0;
          return (
            <g key={d.key}>
              {visibles.map((seg, vi) => {
                const y0 = yFor(acc * t);
                acc += seg.value;
                const y1 = yFor(acc * t);
                const idx = Math.max(0, seriesNames.indexOf(seg.name));
                const esUltimo = vi === visibles.length - 1;
                const h = Math.max(0, y0 - y1 - (vi > 0 ? 1 : 0));
                const activa = serie === seg.name;
                return (
                  <path
                    key={seg.name}
                    className="cx-bar"
                    d={esUltimo ? roundedTop(x, y1, barW, h, Math.min(6, barW / 2)) : `M${x},${y1} h${barW} v${h} h${-barW} Z`}
                    fill={`url(#${uid}s${idx % SERIES_COLORS.length})`}
                    style={{
                      opacity: serie && !activa ? 0.25 : 1,
                      filter: activa ? "drop-shadow(0 4px 8px rgba(0,0,0,0.22))" : "none",
                    }}
                    onMouseMove={(e) => {
                      setSerie(seg.name);
                      setTooltip({ visible: true, x: e.clientX, y: e.clientY, title: `${d.label} · ${seg.name}`, lines: [formatValue(seg.value)] });
                    }}
                    onMouseLeave={() => { setSerie(null); setTooltip(null); }}
                  />
                );
              })}
              <text className="axis-label" x={x + barW / 2} y={H - PAD_B + 17} textAnchor="middle" style={{ opacity: Math.min(1, p * 2.5) }}>
                {d.label}
              </text>
            </g>
          );
        })}
        <line className="baseline" x1={PAD_L} x2={W - PAD_R} y1={PAD_T + innerH} y2={PAD_T + innerH} />
      </svg>
      <Tooltip tooltip={tooltip} />
      <div className="legend">
        {seriesNames.map((name, i) => (
          <span
            className={`chip chip-interactivo${serie && serie !== name ? " dim" : ""}${serie === name ? " on" : ""}`}
            key={name}
            onMouseEnter={() => setSerie(name)}
            onMouseLeave={() => setSerie(null)}
          >
            <span className="swatch" style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }} />
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}
