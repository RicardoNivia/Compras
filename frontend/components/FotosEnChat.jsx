"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { fetchFotosApi, urlFoto } from "@/lib/api";

const MAX_MINIATURAS = 12;

// Fotos de una actividad dentro de una respuesta de Nova (bloque ```fotos {"actividadId":N}```). Nova solo dice de qué
// actividad son: la lista y cada imagen se piden con la sesión de quien mira, así que el permiso lo valida el backend
// igual que en la pestaña Fotos de la actividad.
export default function FotosEnChat({ spec, grande = false }) {
  const actividadId = Number(spec?.actividadId) || null;
  const [fotos, setFotos] = useState(null);
  const [error, setError] = useState("");
  const [abierta, setAbierta] = useState(null);
  const [todas, setTodas] = useState(false);

  useEffect(() => {
    if (!actividadId) return;
    fetchFotosApi(actividadId).then((r) => setFotos(r.fotos || [])).catch((e) => setError(e.message));
  }, [actividadId]);

  useEffect(() => {
    if (abierta == null) return undefined;
    const onKey = (e) => {
      // En captura y sin propagar: si está dentro de un modal, Escape cierra solo la foto, no el modal.
      if (e.key === "Escape") { e.stopPropagation(); setAbierta(null); }
      if (e.key === "ArrowRight") setAbierta((i) => Math.min((fotos?.length || 1) - 1, i + 1));
      if (e.key === "ArrowLeft") setAbierta((i) => Math.max(0, i - 1));
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [abierta, fotos]);

  if (!actividadId) return null;
  if (error) return <div className="chat-fotos-nota">No se pudieron mostrar las fotos: {error}</div>;
  if (!fotos) return <div className="chat-fotos-grid">{[0, 1, 2].map((i) => <div key={i} className="skeleton-bar chat-fotos-esqueleto" />)}</div>;
  if (!fotos.length) return <div className="chat-fotos-nota">Esta actividad no tiene fotos cargadas.</div>;

  const visibles = todas || grande ? fotos : fotos.slice(0, MAX_MINIATURAS);
  const actual = abierta != null ? fotos[abierta] : null;
  return (
    <div className={`chat-fotos${grande ? " grande" : ""}`}>
      <div className="chat-fotos-grid">
        {visibles.map((f, i) => (
          <button key={f.id} type="button" className="fotos-item" onClick={() => setAbierta(i)} aria-label={`Ver ${f.descripcion || f.nombre}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={urlFoto(actividadId, f.id, true)} alt={f.descripcion || f.nombre} loading="lazy" />
          </button>
        ))}
      </div>
      <div className="chat-fotos-nota">
        {fotos.length} foto(s){fotos.length > MAX_MINIATURAS && !todas && !grande && <> · <button type="button" className="link-btn" onClick={() => setTodas(true)}>Ver las {fotos.length}</button></>}
      </div>
      {actual && createPortal(
        <div className="fotos-visor encima" role="dialog" aria-modal="true" aria-label="Foto" onMouseDown={(e) => { if (e.target === e.currentTarget) setAbierta(null); }}>
          <button type="button" className="fotos-cerrar" onClick={() => setAbierta(null)} aria-label="Cerrar">✕</button>
          <button type="button" className="fotos-nav prev" onClick={() => setAbierta(Math.max(0, abierta - 1))} disabled={abierta === 0} aria-label="Anterior">‹</button>
          <figure>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={urlFoto(actividadId, actual.id)} alt={actual.descripcion || actual.nombre} />
            <figcaption>
              <span>{actual.descripcion || actual.nombre}</span>
              <span className="fotos-meta">{abierta + 1} de {fotos.length}{actual.fuente ? ` · ${actual.fuente}` : ""}</span>
            </figcaption>
          </figure>
          <button type="button" className="fotos-nav next" onClick={() => setAbierta(Math.min(fotos.length - 1, abierta + 1))} disabled={abierta === fotos.length - 1} aria-label="Siguiente">›</button>
        </div>,
        document.body,
      )}
    </div>
  );
}
