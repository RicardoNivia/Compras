"use client";

import { IconCopy } from "@/components/icons";

// Botón de la barra superior (al lado de la campana): abre la misma página en otra pestaña del navegador, para
// trabajar con dos vistas a la vez (por ejemplo Registros en una y la ficha de una actividad en la otra).
export default function DuplicarPestana() {
  return (
    <button type="button" className="notif-campana topbar-duplicar" onClick={() => window.open(window.location.href, "_blank", "noopener")}
      title="Abrir esta página en otra pestaña" aria-label="Abrir esta página en otra pestaña">
      <IconCopy size={17} />
    </button>
  );
}
