import { useLayoutEffect, useRef } from "react";

// Hace que un <textarea> crezca (y se encoja) solo a medida que la persona escribe, en vez de mostrar una barra de
// desplazamiento interna. Solo aparece scroll cuando se llega al "max-height" que define el CSS del campo.
// Uso: const ref = useAutoGrow(valor);  <textarea ref={ref} value={valor} ... />
export function useAutoGrow(value) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto"; // medir desde cero para que también se encoja al borrar
    const max = parseFloat(getComputedStyle(el).maxHeight);
    const alto = el.scrollHeight;
    el.style.height = `${Math.min(alto, Number.isFinite(max) ? max : alto)}px`;
    el.style.overflowY = Number.isFinite(max) && alto > max ? "auto" : "hidden";
  }, [value]);
  return ref;
}
