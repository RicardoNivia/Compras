"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { IconBell } from "@/components/icons";
import { contarNoLeidas, EVENTO_NO_LEIDAS } from "@/lib/notificacionesApi";

// Campana de la barra superior: el número rojo cuenta SOLO las notificaciones no leídas de este módulo (las que alguien
// programó y configuró en "Mis notificaciones"). Los pendientes de Mi día nunca suman aquí. El número lo publica
// components/notificaciones/AvisosEnVivo.jsx (que revisa cada 20 s); aquí solo se pide una vez al montar.
export default function CampanaNotificaciones() {
  const [n, setN] = useState(null); // null = sin permiso o aún sin cargar: no se muestra

  useEffect(() => {
    let vivo = true;
    contarNoLeidas().then((r) => { if (vivo) setN(r.noLeidas); }).catch(() => {});
    const alCambiar = (e) => setN(Number(e.detail) || 0);
    window.addEventListener(EVENTO_NO_LEIDAS, alCambiar);
    return () => { vivo = false; window.removeEventListener(EVENTO_NO_LEIDAS, alCambiar); };
  }, []);

  if (n == null) return null;
  return (
    <Link href="/alertas?tab=bandeja" className={`notif-campana${n > 0 ? " con-nuevas" : ""}`} title={n ? `${n} notificación(es) sin leer` : "Notificaciones"} aria-label={n ? `${n} notificaciones sin leer` : "Notificaciones"}>
      <IconBell size={18} />
      {n > 0 && <span className="notif-badge">{n > 99 ? "99+" : n}</span>}
    </Link>
  );
}
