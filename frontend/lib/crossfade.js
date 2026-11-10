import { flushSync } from "react-dom";

const DURACION_MS = 260;

// Zona que cambia con la pestaña: la marcada con data-crossfade (y visible) dentro del bloque de quien hizo clic
// (data-crossfade-raiz), el bloque entero si no marca ninguna, o lo que va justo después de la barra de pestañas.
// El último elemento tocado (con mouse, dedo o teclado): en Safari un clic no deja el botón enfocado.
let ultimo = null;
if (typeof document !== "undefined") {
  const anotar = (e) => { ultimo = e.target; };
  document.addEventListener("pointerdown", anotar, true);
  document.addEventListener("keydown", anotar, true);
}

function zona() {
  const el = ultimo?.isConnected ? ultimo : document.activeElement;
  const raiz = el?.closest?.("[data-crossfade-raiz]");
  if (raiz) return raiz.querySelector("[data-crossfade]:not([hidden])") || raiz;
  return el?.closest?.('[role="tablist"]')?.nextElementSibling || null;
}

// Cambio de pestaña con crossfade: una copia de lo que se ve se desvanece encima mientras lo nuevo aparece. Solo
// cambia la opacidad (sin movimiento), funciona en cualquier navegador y no vuelve a montar nada.
export function crossfade(cambio) {
  const antes = typeof document !== "undefined" ? zona() : null;
  const padre = antes?.offsetParent;
  if (!antes || !padre || !antes.animate) {
    cambio();
    return;
  }
  const ra = antes.getBoundingClientRect();
  const rp = padre.getBoundingClientRect();
  const copia = antes.cloneNode(true);
  copia.removeAttribute("id");
  copia.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
  copia.setAttribute("aria-hidden", "true");
  Object.assign(copia.style, {
    position: "absolute", margin: "0", pointerEvents: "none", zIndex: "5", overflow: "hidden", boxSizing: "border-box",
    top: `${ra.top - rp.top - padre.clientTop + padre.scrollTop}px`, left: `${ra.left - rp.left - padre.clientLeft + padre.scrollLeft}px`,
    width: `${ra.width}px`, height: `${ra.height}px`,
  });
  flushSync(cambio);
  padre.appendChild(copia);
  copia.animate([{ opacity: 1 }, { opacity: 0 }], { duration: DURACION_MS, easing: "ease", fill: "forwards" }).finished.finally(() => copia.remove());
  zona()?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DURACION_MS, easing: "ease" });
}
