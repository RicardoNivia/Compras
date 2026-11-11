"use client";

import { useState } from "react";
import Tooltip from "@/components/Tooltip";
import { fmtCOP, fmtCompact } from "@/lib/format";
import { BarGradient, easeOutCubic, monotonePath, roundedTop, stagger, useMorph, useProgress, useReveal, useUid } from "./chartKit";

const W = 1080;
const H = 320;
const PAD_L = 100;
const PAD_R = 24;
const PAD_T = 22;
const PAD_B = 34;

// Barras divergentes con línea: lo que entra hacia arriba, lo que sale hacia abajo y el neto (puede ser negativo) como
// línea. Mismo lenguaje que el resto del kit: crecen en cascada al entrar, al pasar el cursor la columna se resalta y el
// tooltip muestra las tres cifras; la columna destacada (p. ej. el mes elegido) queda marcada.
// data: [{ key, label, arriba, abajo, linea, destacado? }] — arriba y abajo en positivo.
// nombres: { arriba, abajo, linea }; colores: { arriba, abajo, linea } (variables del tema).
// format: valor exacto (tooltip); formatCorto: eje. onSelect(d): columna clicable.
export default function DivergentBarChartSvg({
  data, nombres = { arriba: "Entra", abajo: "Sale", linea: "Neto" },
  colores = { arriba: "var(--good)", abajo: "var(--critical)", linea: "var(--accent)" },
  format = fmtCOP, formatCorto = fmtCompact, onSelect,
}) {
  const [tooltip, setTooltip] = useState(null);
  const [hover, setHover] = useState(null);
  const [ref, shown] = useReveal();
  const uid = useUid();
  const p = useProgress(shown, 1300);
  const arriba = useMorph((data || []).map((d) => Math.max(0, d.arriba || 0)));
  const abajo = useMorph((data || []).map((d) => Math.max(0, d.abajo || 0)));
  const lineas = useMorph((data || []).map((d) => d.linea || 0));
  if (!data || !data.length) return <div className="empty">No hay datos para graficar.</div>;

  const maxArriba = Math.max(1, ...arriba, ...lineas.map((v) => Math.max(0, v)));
  const maxAbajo = Math.max(1, ...abajo, ...lineas.map((v) => Math.max(0, -v)));
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const escala = innerH / (maxArriba + maxAbajo);
  const y0 = PAD_T + maxArriba * escala;
  const yDe = (v) => y0 - v * escala;
  const bw = innerW / data.length;
  const xCentro = (i) => PAD_L + i * bw + bw / 2;
  const trazo = Math.max(0, Math.min(1, (p - 0.3) / 0.7));
  const puntos = data.map((_, i) => [xCentro(i), yDe(lineas[i] ?? 0)]);
  const marcas = [maxArriba, maxArriba / 2, 0, -maxAbajo / 2, -maxAbajo];

  function mostrar(e, i) {
    const d = data[i];
    setHover(i);
    setTooltip({ visible: true, x: e.clientX, y: e.clientY, title: d.label, lines: [`${nombres.arriba}: ${format(d.arriba || 0)}`, `${nombres.abajo}: ${format(-(d.abajo || 0))}`, `${nombres.linea}: ${format(d.linea || 0)}`] });
  }

  return (
    <div className="chart-wrap" ref={ref}>
      <svg className="cx" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${nombres.arriba}, ${nombres.abajo} y ${nombres.linea} por mes`}>
        <defs>
          <BarGradient id={`${uid}a`} color={colores.arriba} top={0.95} bottom={0.55} />
          <BarGradient id={`${uid}b`} color={colores.abajo} top={0.55} bottom={0.95} />
        </defs>
        {marcas.map((v, i) => (
          <g key={i} style={{ opacity: Math.min(1, p * 3) }}>
            <line className="gridline" x1={PAD_L} x2={W - PAD_R} y1={yDe(v)} y2={yDe(v)} strokeDasharray={v === 0 ? undefined : "3 5"} />
            <text className="axis-label" x={PAD_L - 8} y={yDe(v) + 3} textAnchor="end">{formatCorto(v)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const t = stagger(p, i, data.length);
          const barW = bw * 0.5;
          const x = PAD_L + i * bw + (bw - barW) / 2;
          const hA = (arriba[i] ?? 0) * escala * t;
          const hB = (abajo[i] ?? 0) * escala * t;
          const activa = hover === i;
          const atenuada = hover != null && !activa;
          return (
            <g key={d.key} style={{ cursor: onSelect ? "pointer" : undefined }}>
              <rect x={PAD_L + i * bw + 2} y={PAD_T - 6} width={bw - 4} height={innerH + 6} rx="8" fill={colores.linea} className="cx-band" style={{ opacity: activa ? 0.07 : d.destacado ? 0.09 : 0 }} />
              {hA > 0 && <path d={roundedTop(x, y0 - hA, barW, hA, Math.min(6, barW / 2))} fill={`url(#${uid}a)`} style={{ opacity: atenuada ? 0.35 : 1 }} />}
              {hB > 0 && <path d={roundedTop(x, y0 - hB, barW, hB, Math.min(6, barW / 2))} transform={`translate(0 ${2 * y0}) scale(1 -1)`} fill={`url(#${uid}b)`} style={{ opacity: atenuada ? 0.35 : 1 }} />}
              <text className="axis-label" x={xCentro(i)} y={H - PAD_B + 17} textAnchor="middle" style={{ opacity: Math.min(1, p * 2.5), fill: activa || d.destacado ? "var(--ink)" : undefined, fontWeight: activa || d.destacado ? 700 : 400 }}>{d.label}</text>
            </g>
          );
        })}
        <line className="baseline" x1={PAD_L} x2={W - PAD_R} y1={y0} y2={y0} />
        <path d={monotonePath(puntos)} fill="none" stroke={colores.linea} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" pathLength="1" strokeDasharray="1" strokeDashoffset={1 - easeOutCubic(trazo)} style={{ pointerEvents: "none" }} />
        {puntos.map(([x, y], i) => (
          <circle key={data[i].key} cx={x} cy={y} r={hover === i ? 6 : 4} fill="var(--surface)" stroke={colores.linea} strokeWidth="2.5" style={{ opacity: Math.max(0, Math.min(1, (trazo * data.length - i) * 1.2)), pointerEvents: "none", transition: "r .15s ease" }} />
        ))}
        {data.map((d, i) => (
          <rect key={`hit-${d.key}`} x={PAD_L + i * bw} y={PAD_T - 6} width={bw} height={innerH + 6} fill="transparent"
            onMouseMove={(e) => mostrar(e, i)} onMouseLeave={() => { setHover(null); setTooltip(null); }} onClick={onSelect ? () => onSelect(d) : undefined} />
        ))}
      </svg>
      <Tooltip tooltip={tooltip} />
      <div className="legend" style={{ marginTop: 4, opacity: Math.min(1, p * 2) }}>
        <span className="chip"><span className="swatch" style={{ background: colores.arriba }} /> {nombres.arriba}</span>
        <span className="chip"><span className="swatch" style={{ background: colores.abajo }} /> {nombres.abajo}</span>
        <span className="chip"><span className="swatch-linea" style={{ background: colores.linea }} /> {nombres.linea}</span>
      </div>
    </div>
  );
}
