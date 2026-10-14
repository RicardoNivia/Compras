"use client";

import { easeOutQuart, smoothPath, useProgress, useReveal, useUid } from "./chartKit";

// Mini gráfica de tendencia para dentro de un KPI: la línea se dibuja al entrar, el área se desvanece
// y el último punto late suavemente. data: lista de números (mínimo 2).
export default function Sparkline({ data, color = "var(--accent)", width = 120, height = 34 }) {
  const [ref, shown] = useReveal();
  const uid = useUid();
  const p = useProgress(shown, 1100);
  if (!data || data.length < 2) return null;

  const pad = 4;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const rango = max - min || 1;
  const pts = data.map((v, i) => [pad + (i / (data.length - 1)) * (width - pad * 2), pad + (1 - (v - min) / rango) * (height - pad * 2 - 2)]);
  const linea = smoothPath(pts);
  const area = `${linea} L${pts[pts.length - 1][0]},${height} L${pts[0][0]},${height} Z`;
  const draw = easeOutQuart(Math.min(1, p / 0.85));
  const [ux, uy] = pts[pts.length - 1];

  return (
    <svg ref={ref} className="cx kpi-spark" viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label="Tendencia de los últimos meses">
      <defs>
        <linearGradient id={`${uid}a`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: color, stopOpacity: 0.3 }} />
          <stop offset="100%" style={{ stopColor: color, stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${uid}a)`} style={{ opacity: Math.max(0, (p - 0.4) / 0.6) }} />
      <path d={linea} pathLength="1" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1" strokeDashoffset={1 - draw} />
      <circle cx={ux} cy={uy} r={3 * Math.max(0, (p - 0.8) / 0.2)} fill={color} className="kpi-spark-dot" />
    </svg>
  );
}
