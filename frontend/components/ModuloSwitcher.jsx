"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MODULOS } from "@/lib/modulos";
import { crossfade } from "@/lib/crossfade";
import { Portal } from "@/components/notificaciones/ui";
import { IconCheck, IconChevronDown } from "@/components/icons";

// Selector de módulo tipo «espacio de trabajo» (Slack/Linear): un solo botón arriba del menú con el módulo actual y,
// al abrirlo, un panel con una tarjeta por módulo (color, qué hay ahí y su atajo). Atajos: Alt+1/2/3 cambian directo
// y Alt+M abre el panel; dentro, flechas + Enter, y Esc cierra.
// modulos: [[clave, primera ruta permitida]] en el orden del menú. iconos: { clave: Componente }.
export default function ModuloSwitcher({ modulos, actual, iconos }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [pos, setPos] = useState({ left: 84, top: 12 });
  const [foco, setFoco] = useState(0);
  const boton = useRef(null);
  const panel = useRef(null);

  const ir = useCallback((m, href) => {
    setAbierto(false);
    if (m === actual) return;
    crossfade(() => router.push(href));
  }, [actual, router]);

  const abrir = useCallback(() => {
    const r = boton.current?.getBoundingClientRect();
    if (r) setPos({ left: Math.max(84, Math.round(r.right) + 12), top: Math.max(8, Math.round(r.top) - 4) });
    setFoco(Math.max(0, modulos.findIndex(([m]) => m === actual)));
    setAbierto(true);
  }, [modulos, actual]);

  // Atajos globales.
  useEffect(() => {
    function onKey(e) {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      const n = Number(e.key);
      if (n >= 1 && n <= modulos.length) { e.preventDefault(); const [m, href] = modulos[n - 1]; ir(m, href); }
      if (e.key.toLowerCase() === "m") { e.preventDefault(); abierto ? setAbierto(false) : abrir(); }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [modulos, ir, abrir, abierto]);

  // Dentro del panel: flechas, Enter, Esc y clic afuera.
  useEffect(() => {
    if (!abierto) return undefined;
    panel.current?.querySelectorAll("[role=menuitem]")[foco]?.focus();
    function onKey(e) {
      if (e.key === "Escape") { setAbierto(false); boton.current?.focus(); }
      if (e.key === "ArrowDown") { e.preventDefault(); setFoco((f) => (f + 1) % modulos.length); }
      if (e.key === "ArrowUp") { e.preventDefault(); setFoco((f) => (f - 1 + modulos.length) % modulos.length); }
    }
    function onClic(e) { if (!panel.current?.contains(e.target) && !boton.current?.contains(e.target)) setAbierto(false); }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClic);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onClic); };
  }, [abierto, foco, modulos.length]);

  const Icono = iconos[actual];
  return (
    <>
      <button ref={boton} type="button" className={`modsw-boton m-${actual}${abierto ? " abierto" : ""}`} onClick={() => (abierto ? setAbierto(false) : abrir())}
        aria-haspopup="menu" aria-expanded={abierto} title="Cambiar de módulo (Alt+M)">
        <span className="modsw-ficha">{Icono && <Icono size={17} />}</span>
        <span className="modsw-txt">
          <small>Módulo</small>
          <strong>{MODULOS[actual]?.nombre}</strong>
        </span>
        <span className="modsw-chev" aria-hidden="true"><IconChevronDown size={14} /></span>
      </button>

      {abierto && (
        <Portal>
          <div ref={panel} className="modsw-panel" role="menu" aria-label="Cambiar de módulo" style={{ left: pos.left, top: pos.top }}>
            <div className="modsw-cabeza">
              <strong>Cambiar de módulo</strong>
              <span>Cada módulo tiene su menú y su color</span>
            </div>
            <div className="modsw-lista">
              {modulos.map(([m, href], i) => {
                const I = iconos[m];
                const activo = m === actual;
                return (
                  <button key={m} type="button" role="menuitem" tabIndex={foco === i ? 0 : -1} className={`modsw-opcion m-${m}${activo ? " activo" : ""}`}
                    onClick={() => ir(m, href)} onMouseEnter={() => setFoco(i)} aria-current={activo ? "true" : undefined}>
                    <span className="modsw-ficha grande">{I && <I size={22} />}</span>
                    <span className="modsw-opcion-txt">
                      <strong>{MODULOS[m]?.nombre}</strong>
                      <small>{MODULOS[m]?.descripcion}</small>
                    </span>
                    {activo
                      ? <span className="modsw-aqui"><IconCheck size={12} /> Estás aquí</span>
                      : <kbd className="modsw-kbd">Alt {i + 1}</kbd>}
                  </button>
                );
              })}
            </div>
            <div className="modsw-pie">
              <span><kbd>Alt</kbd> + <kbd>1</kbd>–<kbd>{modulos.length}</kbd> cambia directo</span>
              <span><kbd>Alt</kbd> + <kbd>M</kbd> abre este panel</span>
            </div>
          </div>
        </Portal>
      )}
    </>
  );
}
