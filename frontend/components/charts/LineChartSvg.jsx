"use client";

import { useState } from "react";
import Tooltip from "@/components/Tooltip";
import { fmtCOP, fmtCompact } from "@/lib/format";
import { easeOutCubic, monotonePath, useMorph, useProgress, useReveal, useUid } from "./chartKit";

const W = 1080;
const H = 300;
const PAD_L = 100;
const PAD_R = 24;
const PAD_T = 20;
const PAD_B = 34;

// Líneas por serie (saldos por banco, etc.), con valores negativos y línea de cero. Las líneas se dibujan de izquierda a
// derecha al entrar; la primera serie lleva un área suave. Al pasar el cursor el punto del mes se resalta en todas las
// series y el tooltip las muestra; tocar una serie de la leyenda la resalta.
// labels: [{ key, label, destacado? }]; series: [{ name, color, values: [número | null] }] (null = sin dato, se corta).
export default function LineChartSvg({ labels, series, format = fmtCOP, formatCorto = fmtCompact, onSelect }) {
  const [tooltip, setTooltip] = useState(null);
  const [hover, setHover] = useState(null);
  const [foco, setFoco] = useState(null);
  const [ref, shown] = useReveal();
  const uid = useUid();
  const p = useProgress(shown, 1400);
  const planos = useMorph((series || []).flatMap((s) => s.values.map((v) => v ?? 0)));
  if (!labels?.length || !series?.length) return <div className="empty">No hay datos para graficar.</div>;

  const n = labels.length;
  const valoresDe = (si) => series[si].values.map((v, i) => (v == null ? null : planos[si * n + i] ?? v));
  const todos = series.flatMap((s, si) => valoresDe(si).filter((v) => v != null));
  const max = Math.max(1, ...todos);
  const min = Math.min(0, ...todos);
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const yDe = (v) => PAD_T + ((max - v) / (max - min || 1)) * innerH;
  const bw = innerW / n;
  const xDe = (i) => PAD_L + i * bw + bw / 2;
  const trazo = easeOutCubic(Math.max(0, Math.min(1, (p - 0.15) / 0.85)));
  const marcas = [0, 1, 2, 3, 4].map((k) => min + ((max - min) / 4) * k);

  // Tramos continuos (los null cortan la línea).
  const tramos = (vals) => {
    const out = [];
    let act = [];
    vals.forEach((v, i) => { if (v == null) { if (act.length) out.push(act); act = []; } else act.push([xDe(i), yDe(v)]); });
    if (act.length) out.push(act);
    return out;
  };

  function mostrar(e, i) {
    setHover(i);
    setTooltip({ visible: true, x: e.clientX, y: e.clientY, title: labels[i].label, lines: series.map((s) => `${s.name}: ${s.values[i] == null ? "—" : format(s.values[i])}`) });
  }

  return (
    <div className="chart-wrap" ref={ref}>
      <svg className="cx" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Evolución de ${series.map((s) => s.name).join(", ")}`}>
        <defs>
          <linearGradient id={`${uid}area`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={series[0].color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={series[0].color} stopOpacity="0" />
          </linearGradient>
          <clipPath id={`${uid}clip`}><rect x={PAD_L - 10} y={0} width={(innerW + 20) * trazo} height={H} /></clipPath>
        </defs>
        {marcas.map((v, i) => (
          <g key={i} style={{ opacity: Math.min(1, p * 3) }}>
            <line className="gridline" x1={PAD_L} x2={W - PAD_R} y1={yDe(v)} y2={yDe(v)} strokeDasharray="3 5" />
            <text className="axis-label" x={PAD_L - 8} y={yDe(v) + 3} textAnchor="end">{formatCorto(v)}</text>
          </g>
        ))}
        {min < 0 && <line className="baseline" x1={PAD_L} x2={W - PAD_R} y1={yDe(0)} y2={yDe(0)} />}
        {labels.map((l, i) => (
          <g key={l.key}>
            <rect x={PAD_L + i * bw + 2} y={PAD_T - 6} width={bw - 4} height={innerH + 6} rx="8" fill={series[0].color} className="cx-band" style={{ opacity: hover === i ? 0.07 : l.destacado ? 0.08 : 0 }} />
            <text className="axis-label" x={xDe(i)} y={H - PAD_B + 17} textAnchor="middle" style={{ opacity: Math.min(1, p * 2.5), fill: hover === i || l.destacado ? "var(--ink)" : undefined, fontWeight: hover === i || l.destacado ? 700 : 400 }}>{l.label}</text>
          </g>
        ))}
        <g clipPath={`url(#${uid}clip)`}>
          {tramos(valoresDe(0)).map((t, k) => t.length > 1 && (
            <path key={`a${k}`} d={`${monotonePath(t)} L${t.at(-1)[0]},${yDe(Math.max(min, 0))} L${t[0][0]},${yDe(Math.max(min, 0))} Z`} fill={`url(#${uid}area)`} style={{ opacity: foco != null && foco !== 0 ? 0.3 : 1 }} />
          ))}
          {series.map((s, si) => tramos(valoresDe(si)).map((t, k) => (
            <path key={`${si}-${k}`} d={t.length > 1 ? monotonePath(t) : `M${t[0][0]},${t[0][1]}`} fill="none" stroke={s.color} strokeWidth={si === 0 ? 3 : 2.4} strokeLinecap="round" strokeLinejoin="round" style={{ opacity: foco != null && foco !== si ? 0.25 : 1, transition: "opacity .2s ease" }} />
          )))}
          {hover != null && series.map((s, si) => s.values[hover] != null && (
            <circle key={`p${si}`} cx={xDe(hover)} cy={yDe(valoresDe(si)[hover])} r="5.5" fill="var(--surface)" stroke={s.color} strokeWidth="2.5" style={{ pointerEvents: "none" }} />
          ))}
        </g>
        {labels.map((l, i) => (
          <rect key={`hit-${l.key}`} x={PAD_L + i * bw} y={PAD_T - 6} width={bw} height={innerH + 6} fill="transparent" style={{ cursor: onSelect ? "pointer" : undefined }}
            onMouseMove={(e) => mostrar(e, i)} onMouseLeave={() => { setHover(null); setTooltip(null); }} onClick={onSelect ? () => onSelect(l) : undefined} />
        ))}
      </svg>
      <Tooltip tooltip={tooltip} />
      <div className="legend" style={{ marginTop: 4, opacity: Math.min(1, p * 2) }}>
        {series.map((s, si) => (
          <button key={s.name} type="button" className={`chip chip-interactivo${foco === si ? " on" : ""}`} style={{ cursor: "pointer", opacity: foco != null && foco !== si ? 0.5 : 1 }} onMouseEnter={() => setFoco(si)} onMouseLeave={() => setFoco(null)} onFocus={() => setFoco(si)} onBlur={() => setFoco(null)}>
            <span className="swatch-linea" style={{ background: s.color }} /> {s.name}
          </button>
        ))}
      </div>
    </div>
  );
}
