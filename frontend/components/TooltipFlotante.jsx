"use client";

import { useEffect } from "react";

// Burbujas de texto largo (.desc-tooltip-wrap / .desc-tooltip-bubble) flotando sobre todo: al pasar el mouse se copia la
// burbuja a una capa fija en <body>, así ninguna fila siguiente, overflow de tabla, columna fija ni modal la recorta.
// Se ubica debajo del texto (o encima si no cabe) y nunca se sale de la pantalla. La burbuja original queda oculta
// (html.tt-flotante en globals.css). Se monta una sola vez en el layout de la app.
export default function TooltipFlotante() {
  useEffect(() => {
    const capa = document.createElement("div");
    capa.className = "tt-flotante";
    capa.setAttribute("role", "tooltip");
    document.body.appendChild(capa);
    document.documentElement.classList.add("tt-flotante-on");
    let actual = null;

    const ocultar = () => { actual = null; capa.classList.remove("on"); capa.replaceChildren(); };
    const mostrar = (wrap) => {
      const burbuja = wrap.querySelector(":scope > .desc-tooltip-bubble");
      if (!burbuja || !burbuja.textContent.trim()) return;
      actual = wrap;
      capa.replaceChildren(...[...burbuja.childNodes].map((n) => n.cloneNode(true)));
      capa.classList.add("on");
      const r = wrap.getBoundingClientRect();
      const ancho = capa.offsetWidth;
      const alto = capa.offsetHeight;
      const margen = 8;
      const left = Math.max(margen, Math.min(r.left, window.innerWidth - ancho - margen));
      const abajo = r.bottom + 6;
      const top = abajo + alto + margen > window.innerHeight ? Math.max(margen, r.top - alto - 6) : abajo;
      capa.style.left = `${left}px`;
      capa.style.top = `${top}px`;
    };
    const sobre = (e) => {
      const wrap = e.target.closest?.(".desc-tooltip-wrap");
      if (wrap === actual) return;
      if (wrap) mostrar(wrap); else if (actual) ocultar();
    };
    document.addEventListener("mouseover", sobre);
    window.addEventListener("scroll", ocultar, true);
    window.addEventListener("blur", ocultar);
    return () => {
      document.removeEventListener("mouseover", sobre);
      window.removeEventListener("scroll", ocultar, true);
      window.removeEventListener("blur", ocultar);
      document.documentElement.classList.remove("tt-flotante-on");
      capa.remove();
    };
  }, []);
  return null;
}
