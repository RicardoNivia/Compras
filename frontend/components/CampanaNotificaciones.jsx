"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { IconBell } from "@/components/icons";
import { contarNoLeidas, EVENTO_NO_LEIDAS, EVENTO_SOLICITUDES } from "@/lib/notificacionesApi";

// Campana de la barra superior: el número rojo cuenta SOLO las notificaciones no leídas de este módulo (las que alguien
// programó y configuró en "Mis notificaciones") más, para quien puede crear compras, las solicitudes de compra pendientes.
// Si solo hay solicitudes, lleva a esa pestaña. Los pendientes de Mi día nunca suman aquí. El número lo publica
// components/notificaciones/AvisosEnVivo.jsx (que revisa cada 20 s); aquí solo se pide una vez al montar.
export default function CampanaNotificaciones() {
  const [n, setN] = useState(null); // null = sin permiso o aún sin cargar: no se muestra
  const [solicitudes, setSolicitudes] = useState(0);

  useEffect(() => {
    let vivo = true;
    contarNoLeidas().then((r) => { if (vivo) { setN(r.noLeidas); setSolicitudes(r.solicitudes || 0); } }).catch(() => {});
    const alCambiar = (e) => setN(Number(e.detail) || 0);
    const alCambiarSolicitudes = (e) => setSolicitudes(Number(e.detail) || 0);
    window.addEventListener(EVENTO_NO_LEIDAS, alCambiar);
    window.addEventListener(EVENTO_SOLICITUDES, alCambiarSolicitudes);
    return () => { vivo = false; window.removeEventListener(EVENTO_NO_LEIDAS, alCambiar); window.removeEventListener(EVENTO_SOLICITUDES, alCambiarSolicitudes); };
  }, []);

  if (n == null) return null;
  const total = n + solicitudes;
  const href = solicitudes && !n ? "/alertas?tab=solicitudes" : "/alertas?tab=bandeja";
  const titulo = [n ? `${n} notificación(es) sin leer` : "", solicitudes ? `${solicitudes} solicitud(es) de compra por atender` : ""].filter(Boolean).join(" · ") || "Notificaciones";
  return (
    <Link href={href} className={`notif-campana${total > 0 ? " con-nuevas" : ""}`} title={titulo} aria-label={titulo}>
      <IconBell size={18} />
      {total > 0 && <span className="notif-badge">{total > 99 ? "99+" : total}</span>}
    </Link>
  );
}
