"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchAgenteEvaluacionApi, iniciarAgenteEvaluacionApi, detenerAgenteEvaluacionApi, fetchEstadoAgenteEvaluacionApi } from "@/lib/api";
import { IconSpark, IconAlert } from "@/components/icons";
import { EsqueletoLista } from "@/components/bienestar/Esqueletos";

const PAGE_SIZES = [10, 25, 50, 100];
const CADA_MS = 2500;

// "Agente de evaluación de actividades": reevalúa con Nova solo las actividades que cambiaron después de su última
// calificación (según Auditoría) y actualiza los análisis de los dashboards. Avisa del costo antes de empezar; el trabajo
// sigue en el servidor aunque se cierre esta ventana (backend/lib/agenteEvaluacion.js).
export default function AgenteEvaluacion() {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button type="button" className="btn agente-boton" onClick={() => setAbierto(true)}>
        <IconSpark size={13} /> Agente de evaluación de actividades
      </button>
      {abierto && <ModalAgente onClose={() => setAbierto(false)} />}
    </>
  );
}

function ModalAgente({ onClose }) {
  const router = useRouter();
  const [previa, setPrevia] = useState(null);
  const [trabajo, setTrabajo] = useState(null);
  const [error, setError] = useState("");
  const [iniciando, setIniciando] = useState(false);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
  const [page, setPage] = useState(1);
  const avisado = useRef(false);

  const cargar = useCallback(() => {
    fetchAgenteEvaluacionApi()
      .then((r) => { setPrevia(r); if (r.trabajo) setTrabajo(r.trabajo); })
      .catch((e) => setError(e.message || "No se pudo revisar qué actividades cambiaron."));
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Mientras corre, consulta el avance; al terminar refresca la tabla y los puntajes de la página.
  const corriendo = trabajo?.estado === "corriendo";
  useEffect(() => {
    if (!corriendo) return undefined;
    const t = setInterval(() => {
      fetchEstadoAgenteEvaluacionApi().then((r) => { if (r.trabajo) setTrabajo(r.trabajo); }).catch(() => {});
    }, CADA_MS);
    return () => clearInterval(t);
  }, [corriendo]);
  useEffect(() => {
    if (trabajo?.estado === "terminado" && !avisado.current) {
      avisado.current = true;
      router.refresh();
    }
  }, [trabajo?.estado, router]);

  async function iniciar() {
    setIniciando(true);
    setError("");
    try {
      setTrabajo((await iniciarAgenteEvaluacionApi()).trabajo);
    } catch (e) {
      setError(e.message || "No se pudo iniciar la evaluación.");
    } finally {
      setIniciando(false);
    }
  }

  async function detener() {
    setError("");
    try {
      setTrabajo((await detenerAgenteEvaluacionApi()).trabajo);
    } catch (e) {
      setError(e.message);
    }
  }

  const pendientes = previa?.pendientes || [];
  const totalPages = Math.max(1, Math.ceil(pendientes.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = pendientes.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const llamadas = pendientes.length + (previa?.dashboards || 0);

  const totalPasos = trabajo ? trabajo.total + trabajo.dashboards : 0;
  const pasos = trabajo ? trabajo.hechas + trabajo.dashboardsHechos : 0;
  const avance = trabajo?.estado === "terminado" ? 100 : totalPasos ? Math.round((pasos / totalPasos) * 100) : 0;

  return (
    <div className="modal-overlay detalle-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal agente-modal" role="dialog" aria-modal="true" aria-labelledby="agente-titulo">
        <header className="detalle-cabeza">
          <div>
            <h2 id="agente-titulo">Agente de evaluación de actividades</h2>
            <p>Reevalúa solo las actividades que cambiaron después de su última calificación y actualiza los análisis de los dashboards.</p>
          </div>
          <button type="button" className="btn-ghost icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
        </header>

        <div className="agente-cuerpo">
          {error && <div className="modal-error"><IconAlert size={13} /> {error}</div>}
          {!previa && !trabajo && !error && <EsqueletoLista filas={4} etiqueta="Revisando la auditoría" />}

          {previa && !trabajo && pendientes.length === 0 && (
            <div className="empty">Todas las calificaciones están al día: ninguna actividad cambió después de calificarse.</div>
          )}

          {previa && !trabajo && pendientes.length > 0 && (
            <>
              <div className="agente-aviso" role="alert">
                <IconAlert size={18} />
                <div>
                  <strong>Tendrá un alto costo en IA y puede tardar varios minutos.</strong>
                  <p>Se harán cerca de {llamadas} consultas a la IA: {pendientes.length} actividad(es) y {previa.dashboards} análisis de dashboard. Puedes cerrar esta ventana mientras trabaja. Las demás actividades no se tocan, porque no cambiaron.</p>
                </div>
              </div>
              <div className="table-scroll">
                <table className="records agente-tabla">
                  <thead><tr><th>Actividad</th><th>Línea</th><th>Por qué se reevalúa</th><th className="num">Puntaje actual</th></tr></thead>
                  <tbody>
                    {pageRows.map((a) => (
                      <tr key={a.id}>
                        <td><span className="desc-tooltip-wrap"><span className="desc-text">{a.nombre}</span><span className="desc-tooltip-bubble">{a.nombre}</span></span></td>
                        <td>{a.linea}</td>
                        <td><span className="desc-tooltip-wrap"><span className="desc-text">{a.motivos.join(" · ")}</span><span className="desc-tooltip-bubble">{a.motivos.join(" · ")}</span></span></td>
                        <td className="num">{a.puntajeActual != null ? `★ ${a.puntajeActual}` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="table-footer">
                <div className="field" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <label htmlFor="agente-size" style={{ marginBottom: 0 }}>Tamaño</label>
                  <select id="agente-size" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
                    {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div className="page-btns">
                  <button type="button" className="btn small" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Anterior</button>
                  <button type="button" className="btn small" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>Siguiente</button>
                </div>
                <span className="count-note">Página {currentPage} de {totalPages}</span>
                <div className="spacer" />
                <span className="count-note">{pendientes.length} actividad(es) con cambios</span>
              </div>
            </>
          )}

          {trabajo && (
            <div className="agente-progreso" aria-live="polite">
              <div className="agente-progreso-top">
                <strong>{corriendo ? (trabajo.detenido ? "Deteniendo…" : trabajo.fase === "dashboards" ? "Actualizando los análisis de los dashboards…" : "Reevaluando actividades…") : trabajo.detenido ? "Evaluación detenida" : "Evaluación terminada"}</strong>
                <span>{avance} %</span>
              </div>
              <div className={`agente-barra${corriendo ? " activa" : ""}`} role="progressbar" aria-valuenow={avance} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${avance}%` }} /></div>
              <span className="count-note">
                {trabajo.hechas} de {trabajo.total} actividad(es){trabajo.dashboards ? ` · ${trabajo.dashboardsHechos} de ${trabajo.dashboards} análisis de dashboard` : ""}
                {corriendo && trabajo.actual?.length ? ` · Ahora: ${trabajo.actual.join(", ")}` : ""}
              </span>
              {trabajo.errores?.length > 0 && <div className="modal-error">{trabajo.errores.length} con error: {trabajo.errores.slice(0, 3).join(" · ")}</div>}
              {trabajo.resultados?.length > 0 && (
                <div className="table-scroll">
                  <table className="records agente-tabla">
                    <thead><tr><th>Actividad</th><th className="num">Antes</th><th className="num">Ahora</th><th>Lectura de Nova</th></tr></thead>
                    <tbody>
                      {trabajo.resultados.map((r) => (
                        <tr key={r.id}>
                          <td><span className="desc-tooltip-wrap"><span className="desc-text">{r.nombre}</span><span className="desc-tooltip-bubble">{r.nombre}</span></span></td>
                          <td className="num">{r.antes != null ? `★ ${r.antes}` : "—"}</td>
                          <td className="num"><strong className={r.antes == null || r.despues === r.antes ? "" : r.despues > r.antes ? "agente-sube" : "agente-baja"}>★ {r.despues}</strong></td>
                          <td><span className="desc-tooltip-wrap"><span className="desc-text">{r.titulo}</span><span className="desc-tooltip-bubble">{r.titulo}</span></span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        <footer className="modal-foot">
          {previa && !trabajo && pendientes.length > 0 && (
            <button type="button" className="btn btn-primary" onClick={iniciar} disabled={iniciando}>
              {iniciando && <span className="spinner" />} Acepto, iniciar evaluación
            </button>
          )}
          {corriendo && !trabajo.detenido && <button type="button" className="btn btn-danger-outline" onClick={detener}>Detener</button>}
          <button type="button" className="btn" onClick={onClose}>{corriendo ? "Seguir en segundo plano" : previa && !trabajo && pendientes.length > 0 ? "Cancelar" : "Cerrar"}</button>
        </footer>
      </div>
    </div>
  );
}
