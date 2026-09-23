"use client";

// Gauge circular (donut) para mostrar un porcentaje.
export default function GaugeSvg({ percent }) {
  const size = 180;
  const stroke = 16;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, percent ?? 0));
  const offset = c - (pct / 100) * c;

  let color = "var(--critical)";
  if (pct >= 80) color = "var(--good)";
  else if (pct >= 50) color = "var(--warning)";

  return (
    <div className="gauge-ring">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke="var(--grid)" strokeWidth={stroke}
        />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={c} strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="gauge-value">{Number.isFinite(pct) ? `${Math.round(pct)}%` : "—"}</div>
    </div>
  );
}
