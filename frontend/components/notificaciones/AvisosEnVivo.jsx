"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { novedades, avisarNoLeidas, avisarSolicitudes, marcarLeidas } from "@/lib/notificacionesApi";
import { FuenteIcono } from "@/components/notificaciones/ui";

const CADA_MS = 20 * 1000;
const DURACION_MS = 10 * 1000;
export const EVENTO_REVISAR = "notificaciones:revisar";

// Avisos en vivo: cuando a la persona le llega una notificación, aparece un aviso flotante en la pantalla en la que
// esté. Vive en el layout (app/(app)/layout.js), así no se reinicia al navegar. Revisa cada 20 s (y al instante tras
// "Probar"/"Enviar ahora" o al volver a la pestaña); también publica el contador de no leídas para la campana y el menú.
export default function AvisosEnVivo() {
  const [avisos, setAvisos] = useState([]);
  const ultimo = useRef(null);
  const enCurso = useRef(false);
  const timers = useRef(new Map());

  const cerrar = useCallback((id) => {
    setAvisos((a) => a.filter((x) => x.id !== id));
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
  }, []);

  const programarCierre = useCallback((id) => {
    clearTimeout(timers.current.get(id));
    timers.current.set(id, setTimeout(() => cerrar(id), DURACION_MS));
  }, [cerrar]);

  const revisar = useCallback(async () => {
    if (enCurso.current) return;
    enCurso.current = true;
    try {
      const r = await novedades(ultimo.current);
      avisarNoLeidas(r.noLeidas);
      avisarSolicitudes(r.solicitudes || 0);
      if (ultimo.current != null && r.nuevas?.length) {
        setAvisos((a) => [...r.nuevas.slice().reverse(), ...a].slice(0, 4));
        r.nuevas.forEach((n) => programarCierre(n.id));
      }
      if (r.ultimoId != null) ultimo.current = Math.max(ultimo.current || 0, r.ultimoId);
    } catch {
      // sin permiso o backend caído: se reintenta en el siguiente ciclo
    } finally {
      enCurso.current = false;
    }
  }, [programarCierre]);

  useEffect(() => {
    revisar();
    const t = setInterval(() => { if (document.visibilityState === "visible") revisar(); }, CADA_MS);
    const alVolver = () => { if (document.visibilityState === "visible") revisar(); };
    const alPedir = () => setTimeout(revisar, 600);
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener(EVENTO_REVISAR, alPedir);
    const ts = timers.current;
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener(EVENTO_REVISAR, alPedir);
      ts.forEach((x) => clearTimeout(x));
    };
  }, [revisar]);

  if (!avisos.length) return null;
  return (
    <div className="nx-avisos" role="region" aria-label="Notificaciones nuevas" aria-live="polite">
      {avisos.map((a) => (
        <div key={a.id} className="nx-aviso" onMouseEnter={() => clearTimeout(timers.current.get(a.id))} onMouseLeave={() => programarCierre(a.id)}>
          <FuenteIcono fuente={a.fuente} size={38} />
          <div className="nx-aviso-cuerpo">
            <span className="nx-aviso-kicker">{a.origen === "prueba" ? "Prueba de notificación" : a.origen === "manual" ? `Enviada manualmente${a.manualPor ? ` por ${a.manualPor}` : ""}` : "Nueva notificación"}</span>
            <strong>{a.titulo}</strong>
            {a.texto && <p>{a.texto}</p>}
            <span className="nx-aviso-de">De «{a.notificacionNombre}»{a.configuradaPor ? ` · ${a.configuradaPor}` : ""}</span>
            <div className="nx-aviso-acciones">
              <Link href="/alertas?tab=bandeja" className="btn small btn-primary" onClick={() => { marcarLeidas({ ids: [a.id] }).catch(() => {}); cerrar(a.id); }}>Ver</Link>
              <button type="button" className="btn small btn-ghost" onClick={() => cerrar(a.id)}>Cerrar</button>
            </div>
          </div>
          <button type="button" className="nx-aviso-x" onClick={() => cerrar(a.id)} aria-label="Cerrar aviso">✕</button>
          <span className="nx-aviso-barra" style={{ animationDuration: `${DURACION_MS}ms` }} />
        </div>
      ))}
    </div>
  );
}
