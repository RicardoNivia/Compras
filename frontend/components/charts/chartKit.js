"use client";

import { useEffect, useId, useRef, useState } from "react";

// Utilidades compartidas por las gráficas SVG: animación de entrada coordinada (una sola barra de progreso
// por gráfica), aparición al hacerse visible en pantalla, conteo de cifras y trazados con esquinas redondeadas.

export const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const clamp01 = (t) => Math.max(0, Math.min(1, t));

// Progreso eased del elemento i de n con retardo escalonado: los elementos entran en cascada.
export function stagger(p, i, n, spread = 0.55) {
  const t = clamp01(p * (1 + spread) - (spread * i) / Math.max(1, n - 1));
  return easeOutQuart(t);
}

// Cifra que "sube" hasta su valor; al terminar muestra el valor exacto.
export function tween(value, t) {
  if (t >= 0.999) return value;
  return Number.isInteger(value) ? Math.round(value * t) : value * t;
}

// Ref + bandera: la animación arranca cuando la gráfica entra en pantalla (no mientras está fuera de vista).
export function useReveal() {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") { setShown(true); return undefined; }
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setShown(true); io.disconnect(); }
    }, { threshold: 0.12 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, shown];
}

// Progreso lineal 0→1 de la animación de ENTRADA (solo corre una vez, cuando la gráfica se hace visible).
// Los cambios posteriores de datos los resuelve useMorph. Con "reducir movimiento" activado salta al final.
export function useProgress(run, duration = 1100) {
  const [p, setP] = useState(0);
  useEffect(() => {
    if (!run) return undefined;
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setP(1); return undefined; }
    let raf;
    let start = null;
    const tick = (t) => {
      if (start == null) start = t;
      const v = Math.min(1, (t - start) / duration);
      setP(v);
      if (v < 1) raf = requestAnimationFrame(tick);
    };
    setP(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [run, duration]);
  return p;
}

// Devuelve una lista de números que se desliza suavemente hacia `target` cada vez que este cambia (por ejemplo
// al aplicar un filtro): barras, porciones y ejes pasan del valor anterior al nuevo en vez de redibujarse.
// Si cambia la cantidad de elementos, los que faltan parten de (o terminan en) 0.
export function useMorph(target, duration = 750) {
  const key = target.join("|");
  const [cur, setCur] = useState(target);
  const ref = useRef(target);
  useEffect(() => {
    const to = target;
    const from = ref.current;
    const len = Math.max(from.length, to.length);
    const a = Array.from({ length: len }, (_, i) => from[i] ?? 0);
    const b = Array.from({ length: len }, (_, i) => to[i] ?? 0);
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || a.every((v, i) => v === b[i])) { ref.current = to; setCur(to); return undefined; }
    let raf;
    let start = null;
    const tick = (t) => {
      if (start == null) start = t;
      const v = Math.min(1, (t - start) / duration);
      const e = easeOutCubic(v);
      ref.current = v >= 1 ? to : b.map((x, i) => a[i] + (x - a[i]) * e);
      setCur(ref.current);
      if (v < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, duration]);
  return cur;
}

// Id seguro para usar dentro de url(#...) en gradientes y filtros.
export function useUid() {
  return useId().replace(/[^a-zA-Z0-9]/g, "");
}

// Rectángulo con las esquinas superiores redondeadas (barras que crecen desde la base).
export function roundedTop(x, y, w, h, r = 6) {
  if (h <= 0 || w <= 0) return "";
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`;
}

// Gradiente vertical a partir de una variable de color del tema.
export function BarGradient({ id, color, top = 1, bottom = 0.6 }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" style={{ stopColor: color, stopOpacity: top }} />
      <stop offset="100%" style={{ stopColor: color, stopOpacity: bottom }} />
    </linearGradient>
  );
}

// Curva suave que pasa por todos los puntos (Catmull-Rom convertida a Bézier).
export function smoothPath(pts) {
  if (pts.length < 2) return "";
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    d += ` C${p1[0] + (p2[0] - p0[0]) / 6},${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6},${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]},${p2[1]}`;
  }
  return d;
}

// Curva monótona (Fritsch-Carlson): pasa por todos los puntos sin subir ni bajar más allá de ellos, así una línea de
// cantidades nunca dibuja valores por debajo de cero entre dos meses.
export function monotonePath(pts) {
  if (pts.length < 2) return "";
  const n = pts.length;
  const dx = pts.slice(1).map((p, i) => p[0] - pts[i][0]);
  const m = pts.slice(1).map((p, i) => (p[1] - pts[i][1]) / dx[i]);
  const t = pts.map((_, i) => (i === 0 ? m[0] : i === n - 1 ? m[n - 2] : m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2));
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / m[i], b = t[i + 1] / m[i], h = a * a + b * b;
    if (h > 9) { const k = 3 / Math.sqrt(h); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
  }
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const c = dx[i] / 3;
    d += ` C${pts[i][0] + c},${pts[i][1] + t[i] * c} ${pts[i + 1][0] - c},${pts[i + 1][1] - t[i + 1] * c} ${pts[i + 1][0]},${pts[i + 1][1]}`;
  }
  return d;
}

// Cifra que cuenta de 0 al valor al entrar en pantalla y se desliza al nuevo valor cuando cambia (p. ej. al filtrar).
// \`format\` recibe un número entero y devuelve el texto (fmtPesos, fmtNum, etc.).
export function AnimatedNumber({ value, format = (v) => String(v), duration = 1000 }) {
  const [ref, shown] = useReveal();
  const p = useProgress(shown, duration);
  const [v] = useMorph([Number(value) || 0]);
  return <span ref={ref}>{format(tween(Math.round(v), easeOutQuart(p)))}</span>;
}
