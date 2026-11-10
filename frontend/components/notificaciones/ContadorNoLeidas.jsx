"use client";

import { useEffect, useState } from "react";
import { EVENTO_NO_LEIDAS, contarNoLeidas } from "@/lib/notificacionesApi";

// Número rojo de no leídas en la pestaña Bandeja (lo publica AvisosEnVivo).
export default function ContadorNoLeidas() {
  const [n, setN] = useState(0);
  useEffect(() => {
    contarNoLeidas().then((r) => setN(r.noLeidas)).catch(() => {});
    const alCambiar = (e) => setN(Number(e.detail) || 0);
    window.addEventListener(EVENTO_NO_LEIDAS, alCambiar);
    return () => window.removeEventListener(EVENTO_NO_LEIDAS, alCambiar);
  }, []);
  return n > 0 ? <span className="nx-num rojo">{n > 99 ? "99+" : n}</span> : null;
}
