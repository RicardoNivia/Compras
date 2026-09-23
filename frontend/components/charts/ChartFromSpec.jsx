"use client";

const COLOR_VARS = ["--s1", "--s2", "--s3", "--s4", "--s5", "--sOther"];
const W = 480;
const H = 220;
const PAD_L = 44;
const PAD_R = 12;
const PAD_T = 14;
const PAD_B = 30;

function fmtValue(v) {
  if (typeof v !== "number") return String(v);
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 }).format(v);
}

function BarOrLine({ spec, isLine }) {
  const labels = spec.labels || [];
  const series = (spec.series || []).slice(0, 6);
  const allValues = series.flatMap((s) => s.data || []);
  const maxVal = Math.max(1, ...allValues.map((v) => Number(v) || 0));
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const n = Math.max(labels.length, 1);
  const groupW = innerW / n;

  function yFor(v) {
    return PAD_T + innerH - (v / maxVal) * innerH;
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img">
      {Array.from({ length: 4 }).map((_, i) => {
        const v = (maxVal / 3) * i;
        const y = yFor(v);
        return (
          <g key={i}>
            <line className="gridline" x1={PAD_L} x2={W - PAD_R} y1={y} y2={y} />
            <text className="axis-label" x={PAD_L - 6} y={y + 3} textAnchor="end">{fmtValue(v)}</text>
          </g>
        );
      })}
      <line className="baseline" x1={PAD_L} x2={W - PAD_R} y1={PAD_T + innerH} y2={PAD_T + innerH} />

      {isLine
        ? series.map((s, si) => {
            const pts = (s.data || []).map((v, i) => {
              const x = PAD_L + groupW * i + groupW / 2;
              return `${x},${yFor(Number(v) || 0)}`;
            }).join(" ");
            return <polyline key={si} points={pts} fill="none" stroke={`var(${COLOR_VARS[si % COLOR_VARS.length]})`} strokeWidth="2" />;
          })
        : series.map((s, si) => (s.data || []).map((v, i) => {
            const bw = (groupW * 0.6) / series.length;
            const x = PAD_L + groupW * i + groupW * 0.2 + bw * si;
            const y = yFor(Number(v) || 0);
            return (
              <rect key={`${si}-${i}`} className="mark" x={x} y={y} width={Math.max(1, bw - 2)}
                height={Math.max(0, PAD_T + innerH - y)} fill={`var(${COLOR_VARS[si % COLOR_VARS.length]})`} rx="2" />
            );
          }))}

      {labels.map((l, i) => (
        <text key={i} className="axis-label" x={PAD_L + groupW * i + groupW / 2} y={H - PAD_B + 16} textAnchor="middle">
          {String(l).length > 12 ? `${String(l).slice(0, 11)}…` : l}
        </text>
      ))}
    </svg>
  );
}

function Pie({ spec }) {
  const s = (spec.series || [])[0] || { data: [] };
  const labels = spec.labels || [];
  const data = (s.data || []).map((v) => Number(v) || 0);
  const total = Math.max(1, data.reduce((a, b) => a + b, 0));
  const cx = 100, cy = 100, r = 80;
  let angle = -Math.PI / 2;

  return (
    <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
      <svg viewBox="0 0 200 200" width="180" height="180" role="img">
        {data.map((v, i) => {
          const frac = v / total;
          const a0 = angle;
          const a1 = angle + frac * Math.PI * 2;
          angle = a1;
          const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
          const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
          const large = a1 - a0 > Math.PI ? 1 : 0;
          return (
            <path key={i} d={`M${cx},${cy} L${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1} Z`}
              fill={`var(${COLOR_VARS[i % COLOR_VARS.length]})`} opacity="0.9" />
          );
        })}
      </svg>
      <div className="legend" style={{ flexDirection: "column", alignItems: "flex-start" }}>
        {labels.map((l, i) => (
          <span key={i} className="chip">
            <span className="swatch" style={{ background: `var(${COLOR_VARS[i % COLOR_VARS.length]})` }} />
            {l} — {fmtValue(data[i])}
          </span>
        ))}
      </div>
    </div>
  );
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
