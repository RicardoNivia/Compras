"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createActividadApi } from "@/lib/api";
import { fmtDateDisplay } from "@/lib/format";

// Crear una actividad: solo se pregunta el nombre. Al guardar se crea (en la línea de la página; con fecha si se abrió
// desde un día del cronograma) y se pasa a su página, donde se completa todo lo demás: datos, presupuesto, compras,
// participantes…
export default function NuevaActividadModal({ linea, fecha, basePath, onClose }) {
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const campo = useRef(null);

  useEffect(() => {
    campo.current?.focus();
    const onKey = (e) => { if (e.key === "Escape" && !guardando) onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, guardando]);

  async function guardar(e) {
    e.preventDefault();
    if (!nombre.trim()) { setError("Ponle un nombre a la actividad."); campo.current?.focus(); return; }
    setGuardando(true);
    setError("");
    try {
      const creada = await createActividadApi({ nombre: nombre.trim(), linea, fecha: fecha || null, estado: fecha ? "programada" : "creada" });
      router.push(`${basePath}/actividades/${creada.id}?tab=datos`);
      router.refresh();
    } catch (err) {
      setError(err.message || "No se pudo crear la actividad.");
      setGuardando(false);
    }
  }

  return (
    <div className="modal-overlay nueva-actividad-fondo" onMouseDown={(e) => { if (e.target === e.currentTarget && !guardando) onClose(); }}>
      <form className="modal nueva-actividad" role="dialog" aria-modal="true" aria-labelledby="na-titulo" onSubmit={guardar} noValidate>
        <div className="modal-head">
          <h3 id="na-titulo">Nueva actividad{linea === "Fundación" ? " de Fundación" : ""}</h3>
          <button type="button" className="btn-ghost icon-btn" onClick={onClose} disabled={guardando} aria-label="Cerrar">✕</button>
        </div>
        <div className="nueva-actividad-cuerpo">
          <div className="field">
            <label htmlFor="na-nombre">¿Cómo se llama la actividad?</label>
            <input id="na-nombre" ref={campo} type="text" maxLength={200} placeholder="Ej.: Fiesta de fin de año" value={nombre} onChange={(e) => { setNombre(e.target.value); setError(""); }} aria-invalid={!!error} />
          </div>
          {error && <div className="modal-error" role="alert">{error}</div>}
          <p className="count-note">
            {fecha ? `Queda programada para el ${fmtDateDisplay(fecha)}. ` : ""}Al guardar se abre la actividad para completar lo demás: fechas, responsable, presupuesto, compras y participantes.
          </p>
        </div>
        <div className="modal-foot">
          <button type="submit" className="btn btn-primary" disabled={guardando}>{guardando && <span className="spinner" />} Guardar y continuar</button>
          <button type="button" className="btn" onClick={onClose} disabled={guardando}>Cancelar</button>
        </div>
      </form>
    </div>
  );
}
