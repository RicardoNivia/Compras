"use client";

import { useCallback, useEffect, useState } from "react";
import { contenidoCompartidoApi } from "@/lib/api";
import { IconAlert } from "@/components/icons";
import InformeWeb from "@/components/informes/InformeWeb";

// Un informe compartido (menú "Ver informes"): se recalcula con los datos de hoy cada vez que se abre, según el período
// que eligió quien lo creó. Solo lectura, como página web interactiva (ver InformeWeb.jsx).
export default function VisorCompartido({ informe }) {
  const [content, setContent] = useState(null);
  const [generadoAt, setGeneradoAt] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const r = await contenidoCompartidoApi(informe.id);
      setContent(r.content);
      setGeneradoAt(r.generadoAt);
    } catch (e) {
      setError(e.message || "No se pudo cargar el informe.");
    } finally {
      setCargando(false);
    }
  }, [informe.id]);

  useEffect(() => { cargar(); }, [cargar]);

  return (
    <div className="est">
      {error && <div className="modal-error"><IconAlert size={13} /> {error}</div>}
      <InformeWeb
        informe={{ nombre: informe.nombre, periodoGeneral: informe.periodoGeneral, contexto: informe.contexto, bloques: informe.bloques }}
        content={content} cargando={cargando} generadoAt={generadoAt}
        subtitulo={informe.creadoPor ? `Creado por ${informe.creadoPor}` : null}
        acciones={<button type="button" className="btn small" onClick={cargar} disabled={cargando}>Actualizar datos</button>}
      />
    </div>
  );
}
