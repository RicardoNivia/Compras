"use client";

// Tooltip compartido para los gráficos SVG: se posiciona con estado React
// en vez de manipular el DOM directamente.
export default function Tooltip({ tooltip }) {
  if (!tooltip || !tooltip.visible) {
    return <div className="tooltip" hidden />;
  }
  return (
    <div
      className="tooltip"
      style={{ left: tooltip.x, top: tooltip.y }}
    >
      {tooltip.title ? <div className="tt-title">{tooltip.title}</div> : null}
      {tooltip.lines?.map((line, i) => (
        <div key={i}>{line}</div>
      ))}
    </div>
  );
}
