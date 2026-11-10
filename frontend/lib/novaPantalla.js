"use client";

import { useEffect } from "react";

// Contexto de pantalla para Nova: cada pantalla describe en una frase lo que el usuario está viendo
// (pestaña activa, filtros, cifras). El widget flotante lo envía junto con la pregunta, así Nova puede
// responder sobre "esta pantalla" y sus números. Es solo texto descriptivo, nunca datos sensibles.
const CLAVE = "__novaPantalla";

export function usePantallaNova(descripcion) {
  useEffect(() => {
    window[CLAVE] = descripcion || "";
    return () => { if (window[CLAVE] === descripcion) window[CLAVE] = ""; };
  }, [descripcion]);
}

export function leerPantallaNova() {
  if (typeof window === "undefined") return "";
  return String(window[CLAVE] || "").slice(0, 700);
}
