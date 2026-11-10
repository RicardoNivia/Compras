"use client";

// Puntaje de la valoración de Nova (1 a 5) como pill con color: 4-5 verde, 3 naranja, 1-2 rojo.
export function claseDePuntaje(p) {
  if (p == null) return "muted";
  if (p >= 4) return "good";
  if (p >= 3) return "warning";
  return "critical";
}

export default function ValoracionPuntaje({ puntaje, titulo, decimales = false }) {
  if (puntaje == null) return <span className="muted">—</span>;
  const texto = decimales ? Number(puntaje).toFixed(1) : String(puntaje);
  return (
    <span className={`pill ${claseDePuntaje(puntaje)} valoracion-pill`} title={titulo}>
      ★ {texto}<span className="valoracion-pill-max">/5</span>
    </span>
  );
}
