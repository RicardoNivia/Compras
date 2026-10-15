"use client";

import { useRef, useState } from "react";

// Texto de una sola línea que se corta con "…" y, SOLO si de verdad quedó cortado, muestra el texto completo en la
// burbuja de la app (desc-tooltip-bubble) al pasar el cursor. La burbuja se dibuja con position: fixed para que
// ningún contenedor con scroll (table-scroll) la recorte, aunque la tabla tenga una sola fila.
export default function Truncado({ v, max = 220, className = "" }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  if (!v) return <span className="muted">—</span>;

  function mostrar() {
    const el = ref.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    const r = el.getBoundingClientRect();
    const abajo = window.innerHeight - r.bottom > 120;
    setPos({ left: Math.min(r.left, window.innerWidth - 380), top: abajo ? r.bottom + 6 : undefined, bottom: abajo ? undefined : window.innerHeight - r.top + 6 });
  }

  return (
    <span onMouseEnter={mostrar} onMouseLeave={() => setPos(null)} onFocus={mostrar} onBlur={() => setPos(null)} style={{ display: "block", minWidth: 0 }}>
      <span ref={ref} className={`desc-text ${className}`} style={{ maxWidth: max }}>{v}</span>
      {pos && <span className="desc-tooltip-bubble" style={{ display: "block", position: "fixed", ...pos }} role="tooltip">{v}</span>}
    </span>
  );
}
