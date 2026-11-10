"use client";

import { useCallback, useEffect, useState } from "react";
import { contenidoCompartidoApi, generarEdicionApi } from "@/lib/api";
import { IconEye, IconAlert } from "@/components/icons";
import InformeWeb from "@/components/informes/InformeWeb";
import CifraDrawer from "@/components/informes/CifraDrawer";

// Informe "solo para consultar", tal como lo ven las personas con acceso: una página web interactiva (InformeWeb.jsx)
// cuyas cifras, gráficas y tablas se recalculan con los datos del momento; el texto de Nova es el que se guardó al
// diseñarlo, así que abrirlo o actualizarlo NO usa la IA. Las cifras se pueden abrir para ver de dónde salen.
export default function VistaConsulta({ informe, onContenido, onVistaPrevia, onVerFotos }) {
  const [guardandoFoto, setGuardandoFoto] = useState(false);
  const [fotoOk, setFotoOk] = useState(null);
  const [content, setContent] = useState(null);
  const [generadoAt, setGeneradoAt] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [cifra, setCifra] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const r = await contenidoCompartidoApi(informe.id);
      setContent(r.content);
      setGeneradoAt(r.generadoAt);
      onContenido?.(r.content);
    } catch (e) {
      setError(e.message || "No se pudo cargar el informe.");
    } finally {
      setCargando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [informe.id]);

  useEffect(() => { cargar(); }, [cargar]);

  // "Guardar foto": congela el informe tal como está hoy en su histórico (con su PDF), sin usar IA.
  async function guardarFoto() {
    setGuardandoFoto(true);
    setError("");
    setFotoOk(null);
    try {
      const r = await generarEdicionApi(informe.id, "foto");
      setFotoOk(r.edicion);
    } catch (e) {
      setError(e.message || "No se pudo guardar la foto.");
    } finally {
      setGuardandoFoto(false);
    }
  }

  return (
    <div className="est">
      {fotoOk && (
        <div className="est-verificada" role="status">
          <span><strong>Foto guardada</strong> · {fotoOk.periodoLabel}, {new Date(fotoOk.createdAt).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}.</span>
          <div className="spacer" />
          <button type="button" className="btn small" onClick={onVerFotos}>Ver fotos guardadas</button>
        </div>
      )}
      {error && <div className="modal-error"><IconAlert size={13} /> {error}</div>}
      <InformeWeb
        informe={informe} content={content} cargando={cargando} generadoAt={generadoAt}
        onCifra={(p) => setCifra({ ...p, periodo: informe.periodoGeneral, excluirAnulados: informe.contexto?.excluirAnulados !== false, filtros: informe.contexto?.filtros || null })}
        acciones={(
          <>
            <button type="button" className="btn small" onClick={cargar} disabled={cargando}>Actualizar datos</button>
            <button type="button" className="btn small" onClick={onVistaPrevia} disabled={!content}><IconEye size={13} /> Ver como PDF</button>
            <button type="button" className="btn small btn-primary" onClick={guardarFoto} disabled={guardandoFoto || cargando} title="Guarda el informe tal como está hoy en el histórico">
              {guardandoFoto ? <><span className="spinner" /> Guardando…</> : "Guardar foto"}
            </button>
          </>
        )}
      />
      {cifra && <CifraDrawer params={cifra} onClose={() => setCifra(null)} />}
    </div>
  );
}
