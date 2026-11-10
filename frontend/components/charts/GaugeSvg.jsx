"use client";

import { easeOutQuart, tween, useMorph, useProgress, useReveal, useUid } from "./chartKit";

// Gauge circular (dona) para mostrar un porcentaje: el arco se llena con una curva suave, tiene degradado y
// un leve brillo, y la cifra central sube hasta el valor.
export default function GaugeSvg({ percent }) {
  const size = 180;
  const stroke = 16;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, percent ?? 0));
  const [ref, shown] = useReveal();
  const uid = useUid();
  const p = useProgress(shown, 1300);
  const t = easeOutQuart(p);
  const [pctVis] = useMorph([pct]); // al cambiar el valor, el arco se desliza al nuevo porcentaje
  const offset = c - (pctVis / 100) * c * t;

  let color = "var(--critical)";
  if (pct >= 80) color = "var(--good)";
  else if (pct >= 50) color = "var(--warning)";

  return (
    <div className="gauge-ring" ref={ref}>
      <svg className="cx" viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        <defs>
          <linearGradient id={`${uid}g`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" style={{ stopColor: color, stopOpacity: 0.7 }} />
            <stop offset="100%" style={{ stopColor: color, stopOpacity: 1 }} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--grid)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={`url(#${uid}g)`} strokeWidth={stroke}
          strokeDasharray={c} strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ filter: `drop-shadow(0 0 6px color-mix(in srgb, ${color} 45%, transparent))` }}
        />
      </svg>
      <div className="gauge-value">{Number.isFinite(pct) ? `${tween(Math.round(pctVis), t)}%` : "—"}</div>
    </div>
  );
}
