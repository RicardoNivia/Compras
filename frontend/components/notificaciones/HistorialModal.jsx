"use client";

import { Portal } from "@/components/notificaciones/ui";

import { Fragment, useEffect, useState } from "react";
import { listarEjecuciones } from "@/lib/notificacionesApi";
import { RESULTADOS, CANALES } from "@/lib/notificacionesCatalogo";
import { Texto, fechaHora, OrigenPill } from "@/components/notificaciones/ContenidoNotificacion";

const PAGE_SIZES = [10, 25, 50, 100];
const ENTREGA = { enviada: ["good", "Enviada"], error: ["critical", "Error"], omitida: ["muted", "Omitida"], pendiente: ["warning", "Pendiente"] };

// Historial de una notificación: cada ejecución (programada, manual, con retraso o prueba) y sus entregas.
// Responde "¿por qué no me llegó?": cada entrega dice su estado y el motivo.
export default function HistorialModal({ notificacion, onClose }) {
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(PAGE_SIZES[0]);
  const [data, setData] = useState({ ejecuciones: [], total: 0 });
  const [abierta, setAbierta] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    listarEjecuciones(notificacion.id, { page, size })
      .then((r) => { setData(r); if (r.page !== page) setPage(r.page); })
      .catch((e) => setError(e.message));
  }, [notificacion.id, page, size]);
  useEffect(() => { setPage(1); }, [size]);

  const totalPages = Math.max(1, Math.ceil(data.total / size));

  return (
    <Portal>
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal notif-modal-ancho" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Historial de envíos">
        <div className="modal-head">
          <h3>Historial · {notificacion.nombre}</h3>
          <button type="button" className="btn btn-ghost" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div style={{ padding: "8px 0" }}>
          {error && <p className="modal-error" style={{ padding: "0 22px" }}>{error}</p>}
          <div className="table-scroll">
            <table className="audit-log notif-tabla">
              <thead>
                <tr><th>Fecha</th><th>Origen</th><th>Resultado</th><th>Resultados</th><th>Entregas</th></tr>
              </thead>
              <tbody>
                {data.ejecuciones.length === 0 && <tr><td colSpan={5}><div className="empty">Todavía no se ha ejecutado.</div></td></tr>}
                {data.ejecuciones.map((e) => {
                  const enviadas = e.entregas.filter((x) => x.estado === "enviada").length;
                  return (
                    <Fragment key={e.id}>
                      <tr onClick={() => setAbierta(abierta === e.id ? null : e.id)} style={{ cursor: "pointer" }}>
                        <td style={{ whiteSpace: "nowrap" }}>{fechaHora(e.createdAt)}{e.retrasoMin ? <span className="count-note"> · {e.retrasoMin} min tarde</span> : null}</td>
                        <td><OrigenPill origen={e.origen} por={e.creadoPorNombre} /></td>
                        <td><span className={`pill ${e.estado === "enviada" ? "good" : e.estado === "error" ? "critical" : e.estado === "parcial" ? "warning" : "muted"}`}>{RESULTADOS[e.estado] || e.estado}</span></td>
                        <td>{e.resultados}</td>
                        <td className="truncate"><Texto v={e.error || `${enviadas} de ${e.entregas.length} enviadas · ver detalle`} /></td>
                      </tr>
                      {abierta === e.id && (
                        <tr className="notif-detalle">
                          <td colSpan={5}>
                            {e.entregas.length === 0 ? <p className="muted" style={{ margin: 0 }}>{e.estado === "omitida_sin_resultados" ? "No se envió: no había resultados." : "Sin entregas."}</p> : (
                              <table className="audit-log notif-items">
                                <tbody>
                                  {e.entregas.map((x) => (
                                    <tr key={x.id}>
                                      <td className="truncate"><Texto v={x.userNombre} /></td>
                                      <td>{CANALES[x.canal] || x.canal}</td>
                                      <td><span className={`pill ${ENTREGA[x.estado]?.[0] || "muted"}`}>{ENTREGA[x.estado]?.[1] || x.estado}</span></td>
                                      <td className="truncate"><Texto v={x.motivo || (x.leidaAt ? `Leída ${fechaHora(x.leidaAt)}` : "")} /></td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="table-footer">
            <div className="field" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <label htmlFor="hist-pagesize" style={{ marginBottom: 0 }}>Tamaño</label>
              <select id="hist-pagesize" value={size} onChange={(ev) => setSize(Number(ev.target.value))}>
                {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div className="page-btns">
              <button type="button" className="btn small" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</button>
              <button type="button" className="btn small" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Siguiente</button>
            </div>
            <span className="count-note">Página {Math.min(page, totalPages)} de {totalPages}</span>
            <div className="spacer" />
            <span className="count-note">{data.total} ejecución(es)</span>
          </div>
        </div>
      </div>
    </div>
    </Portal>
  );
}
