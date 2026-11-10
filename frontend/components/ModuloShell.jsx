"use client";

import { createContext, useContext, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { COOKIE_MODULO, MODULO_POR_DEFECTO, moduloDeRuta, moduloValido } from "@/lib/modulos";

// Envuelve toda la app autenticada y le pone el módulo activo (data-modulo): el CSS cambia con eso todo el tema
// (Compras azul → turquesa, Bienestar verde → turquesa). Se calcula también en el render del servidor (usePathname
// funciona en SSR y la cookie la lee el layout), así la página nunca parpadea con el color del otro módulo.
const ModuloContext = createContext(null);

// Una ruta general (Nova, Alertas, Usuarios…) conserva el último módulo. moduloInicial solo sirve al cargar la página: el
// layout no se vuelve a renderizar al navegar, así que después de eso el último módulo se recuerda aquí.
export function useModuloActual(moduloInicial) {
  const pathname = usePathname();
  const ultimo = useRef(moduloValido(moduloInicial) || MODULO_POR_DEFECTO);
  const deRuta = moduloDeRuta(pathname);
  if (deRuta) ultimo.current = deRuta;
  return ultimo.current;
}

// El módulo activo de la página (incluidas las rutas generales, que conservan el último módulo).
export function useModulo() {
  return useContext(ModuloContext) || MODULO_POR_DEFECTO;
}

export default function ModuloShell({ moduloInicial, children }) {
  const modulo = useModuloActual(moduloInicial);

  // Recuerda el último módulo para las rutas generales (Alertas, Nova, Usuarios…).
  useEffect(() => {
    document.cookie = `${COOKIE_MODULO}=${modulo}; path=/; max-age=31536000; samesite=lax`;
  }, [modulo]);

  return (
    <ModuloContext.Provider value={modulo}>
      <div className="app-shell" data-modulo={modulo}>
        {children}
      </div>
    </ModuloContext.Provider>
  );
}
