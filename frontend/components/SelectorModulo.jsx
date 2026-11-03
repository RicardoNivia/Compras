"use client";

import Link from "next/link";
import { MODULOS } from "@/lib/modulos";
import { useModulo } from "@/components/ModuloShell";
import { modulosDelUsuario, ICONOS_MODULO } from "@/components/Sidebar";

// Interruptor de módulo en la barra superior (Compras / Bienestar), cada uno con su degradado. Solo aparece si el rol
// tiene acceso a más de un módulo: quien no tiene nada de Bienestar ni lo ve ni puede cambiar (y las páginas de
// Bienestar igual lo redirigen si escribe la ruta).
export default function SelectorModulo({ user }) {
  const modulo = useModulo();
  if (!user) return null;
  const destinos = modulosDelUsuario(user);
  const claves = Object.keys(destinos);
  if (claves.length < 2) return null;

  return (
    <nav className="selector-modulo" aria-label="Cambiar de módulo">
      {claves.map((m) => {
        const Icono = ICONOS_MODULO[m];
        const activo = m === modulo;
        return (
          <Link
            key={m}
            href={destinos[m]}
            className={`selector-modulo-opcion m-${m}${activo ? " activo" : ""}`}
            aria-current={activo ? "page" : undefined}
            title={MODULOS[m].descripcion}
          >
            <Icono size={15} />
            <span>{MODULOS[m].nombre}</span>
          </Link>
        );
      })}
    </nav>
  );
}
