"use client";

import { useEffect, useState } from "react";
import { MESES, fmtDateTime } from "@/lib/format";
import { fetchAnalisisBienestarApi, generarAnalisisBienestarApi } from "@/lib/api";
import { IconSpark } from "@/components/icons";
import { Bloque } from "@/components/bienestar/Esqueletos";

const TIPOS = { logro: "Lo que funcionó", alerta: "Para revisar", idea: "Siguiente paso" };

// Análisis de Nova del período que se está viendo: el general del año (mes 0) o el de cada mes, que cambia al cambiar
// de mes. Se genera solo el día 1 de cada mes (backend/lib/analisisBienestar.js); "Resumir de nuevo" lo recalcula con
// los datos de hoy. Mientras un período no tenga análisis se muestra la lectura rápida que se calcula sin IA (respaldo).
export default function AnalisisNova({ linea, anio, mes = 0, puedeEditar, respaldo = [], children }) {
  const [analisis, setAnalisis] = useState(undefined); // undefined = cargando, null = aún no hay
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState("");
  const periodo = mes ? `${MESES[mes - 1].toLowerCase()} de ${anio}` : String(anio);

  useEffect(() => {
    let vigente = true;
    setAnalisis(undefined);
    setError("");
    fetchAnalisisBienestarApi(linea, anio, mes)
      .then((r) => { if (vigente) setAnalisis(r.analisis); })
      .catch((e) => { if (vigente) { setAnalisis(null); setError(e.message || "No se pudo cargar el análisis."); } });
    return () => { vigente = false; };
  }, [linea, anio, mes]);

  async function resumir() {
    setGenerando(true);
    setError("");
    try {
      setAnalisis((await generarAnalisisBienestarApi({ linea, anio, mes })).analisis);
    } catch (e) {
      setError(e.message || "Nova no pudo generar el análisis. Intenta de nuevo.");
    } finally {
      setGenerando(false);
    }
  }

  return (
    <section className="resumen-card resumen-lectura" aria-labelledby="res-lectura" aria-busy={generando}>
      <div className="resumen-lectura-head">
        <h2 id="res-lectura"><IconSpark size={15} /> {mes ? `Análisis de ${MESES[mes - 1].toLowerCase()}` : `Análisis general de ${anio}`}</h2>
        {puedeEditar && analisis !== undefined && (
          <button type="button" className="btn small" onClick={resumir} disabled={generando}>
            {generando && <span className="spinner" />} {generando ? "Nova está resumiendo…" : analisis ? "Resumir de nuevo" : "Generar análisis"}
          </button>
        )}
      </div>

      {analisis === undefined ? (
        <div className="esq" role="status" aria-label="Cargando el análisis"><Bloque w="55%" h={18} /><Bloque h={11} /><Bloque w="85%" h={11} /></div>
      ) : analisis ? (
        <>
          <strong className="resumen-lectura-titulo">{analisis.titulo}</strong>
          <p>{analisis.resumen}</p>
          {analisis.puntos.length > 0 && (
            <ul className="resumen-lectura-puntos">
              {analisis.puntos.map((pt, i) => (
                <li key={i} className={pt.tipo}>
                  <span>{TIPOS[pt.tipo] || pt.tipo}</span>
                  {pt.texto}
                </li>
              ))}
            </ul>
          )}
          <span className="count-note">
            {analisis.origen === "automatico" ? "Generado automáticamente" : `Resumido por ${analisis.creadoPorNombre || "—"}`} el {fmtDateTime(analisis.generadoAt)} · datos hasta {analisis.corte}
          </span>
        </>
      ) : (
        <>
          {respaldo.length
            ? respaldo.map((t, i) => <p key={i}>{t}</p>)
            : <p>Cuando haya actividades con asistentes y compras, aquí verás cómo se relacionan.</p>}
          <span className="count-note">Nova aún no ha analizado {periodo}. Lo hace sola el día 1 de cada mes, con el mes que terminó y el general del año.</span>
        </>
      )}
      {error && <div className="modal-error">{error}</div>}
      {children}
    </section>
  );
}
