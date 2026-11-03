"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchFotosApi, subirFotoApi, actualizarFotoApi, eliminarFotoApi, urlFoto } from "@/lib/api";
import { IconPlus, IconTrash } from "@/components/icons";
import { EsqueletoFotos } from "@/components/bienestar/Esqueletos";

const MAX_LADO = 1600;
const MAX_MINI = 480;

// Reduce la foto en el navegador antes de subirla (la de un celular pesa 3-8 MB; reducida, unos 200-400 KB):
// imagen ≤ 1.600 px y miniatura ≤ 480 px, en JPEG.
export async function reducir(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => null);
  if (!bitmap) throw new Error(`"${file.name}" no es una imagen que se pueda leer.`);
  const lienzo = (max, calidad) => new Promise((resolve) => {
    const k = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bitmap.width * k);
    c.height = Math.round(bitmap.height * k);
    c.getContext("2d").drawImage(bitmap, 0, 0, c.width, c.height);
    c.toBlob((b) => resolve({ blob: b, ancho: c.width, alto: c.height }), "image/jpeg", calidad);
  });
  const grande = await lienzo(MAX_LADO, 0.84);
  const mini = await lienzo(MAX_MINI, 0.78);
  bitmap.close?.();
  return { imagen: grande.blob, miniatura: mini.blob, ancho: grande.ancho, alto: grande.alto };
}

// Material fotográfico de una actividad: galería, subir varias a la vez (o arrastrarlas), verlas en grande,
// describirlas y quitarlas.
export default function FotosActividad({ actividadId, puedeEditar, onCambio }) {
  const [fotos, setFotos] = useState(null);
  const [error, setError] = useState("");
  const [progreso, setProgreso] = useState(null); // { hechas, total }
  const [abierta, setAbierta] = useState(null); // índice en fotos
  const [arrastrando, setArrastrando] = useState(false);
  const input = useRef(null);

  const cargar = useCallback(() => {
    fetchFotosApi(actividadId).then((r) => setFotos(r.fotos)).catch((e) => setError(e.message || "No se pudieron cargar las fotos."));
  }, [actividadId]);
  useEffect(() => { cargar(); }, [cargar]);

  async function subir(files) {
    const lista = [...files].filter((f) => f.type.startsWith("image/"));
    if (!lista.length) return;
    setError("");
    setProgreso({ hechas: 0, total: lista.length });
    const errores = [];
    for (const [i, f] of lista.entries()) {
      try {
        const r = await reducir(f);
        await subirFotoApi(actividadId, { ...r, nombre: f.name });
      } catch (e) {
        errores.push(`${f.name}: ${e.message}`);
      }
      setProgreso({ hechas: i + 1, total: lista.length });
    }
    setProgreso(null);
    if (errores.length) setError(errores.slice(0, 3).join(" · ") + (errores.length > 3 ? ` (y ${errores.length - 3} más)` : ""));
    cargar();
    onCambio?.();
  }

  // Navegación del visor con el teclado.
  useEffect(() => {
    if (abierta == null) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setAbierta(null);
      if (e.key === "ArrowRight") setAbierta((i) => Math.min((fotos?.length || 1) - 1, i + 1));
      if (e.key === "ArrowLeft") setAbierta((i) => Math.max(0, i - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [abierta, fotos]);

  if (!fotos) return error ? <div className="modal-error">{error}</div> : <EsqueletoFotos />;
  const actual = abierta != null ? fotos[abierta] : null;

  return (
    <div className="ficha-seccion">
      {puedeEditar && (
        <div
          className={`fotos-zona${arrastrando ? " activa" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={(e) => { e.preventDefault(); setArrastrando(false); subir(e.dataTransfer.files); }}
        >
          <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => { subir(e.target.files); e.target.value = ""; }} />
          <button type="button" className="btn btn-primary" onClick={() => input.current?.click()} disabled={!!progreso}>
            <IconPlus size={13} /> Agregar fotos
          </button>
          <span className="count-note">o arrástralas aquí · se reducen antes de subirlas</span>
          {progreso && <span className="fotos-progreso"><span className="spinner" /> Subiendo {progreso.hechas} de {progreso.total}…</span>}
        </div>
      )}
      {error && <div className="modal-error">{error}</div>}

      {fotos.length === 0 ? (
        <div className="empty">Esta actividad aún no tiene material fotográfico.</div>
      ) : (
        <div className="fotos-grid">
          {fotos.map((f, i) => (
            <button key={f.id} type="button" className="fotos-item" onClick={() => setAbierta(i)} aria-label={`Ver ${f.descripcion || f.nombre}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={urlFoto(actividadId, f.id, true)} alt={f.descripcion || f.nombre} loading="lazy" />
              {f.origen === "informe" && <span className="fotos-origen">Informe</span>}
            </button>
          ))}
        </div>
      )}
      <span className="count-note">{fotos.length} foto(s)</span>

      {actual && (
        <div className="fotos-visor" role="dialog" aria-modal="true" aria-label="Foto" onMouseDown={(e) => { if (e.target === e.currentTarget) setAbierta(null); }}>
          <button type="button" className="fotos-cerrar" onClick={() => setAbierta(null)} aria-label="Cerrar">✕</button>
          <button type="button" className="fotos-nav prev" onClick={() => setAbierta(Math.max(0, abierta - 1))} disabled={abierta === 0} aria-label="Anterior">‹</button>
          <figure>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={urlFoto(actividadId, actual.id)} alt={actual.descripcion || actual.nombre} />
            <figcaption>
              {puedeEditar ? (
                <input
                  key={actual.id}
                  defaultValue={actual.descripcion || ""}
                  placeholder="Escribe una descripción…"
                  aria-label="Descripción de la foto"
                  onBlur={async (e) => {
                    if ((actual.descripcion || "") === e.target.value.trim()) return;
                    const { foto } = await actualizarFotoApi(actividadId, actual.id, { descripcion: e.target.value }).catch((er) => { setError(er.message); return {}; });
                    if (foto) setFotos((l) => l.map((x) => (x.id === foto.id ? foto : x)));
                  }}
                />
              ) : <span>{actual.descripcion || actual.nombre}</span>}
              <span className="fotos-meta">
                {abierta + 1} de {fotos.length} · {actual.ancho}×{actual.alto}{actual.fuente ? ` · ${actual.fuente}` : ""}{actual.creadoPorNombre ? ` · subida por ${actual.creadoPorNombre}` : ""}
              </span>
              <span className="fotos-acciones">
                <a className="btn small" href={urlFoto(actividadId, actual.id)} download={actual.nombre}>Descargar</a>
                {puedeEditar && (
                  <button type="button" className="btn small btn-danger-outline" onClick={async () => {
                    if (!window.confirm("¿Quitar esta foto de la actividad?")) return;
                    await eliminarFotoApi(actividadId, actual.id).catch((er) => setError(er.message));
                    setAbierta(null);
                    cargar();
                    onCambio?.();
                  }}>
                    <IconTrash size={12} /> Quitar
                  </button>
                )}
              </span>
            </figcaption>
          </figure>
          <button type="button" className="fotos-nav next" onClick={() => setAbierta(Math.min(fotos.length - 1, abierta + 1))} disabled={abierta === fotos.length - 1} aria-label="Siguiente">›</button>
        </div>
      )}
    </div>
  );
}
