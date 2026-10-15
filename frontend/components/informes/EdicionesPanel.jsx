"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchEdicionesApi, fetchActividadInformeApi, generarEdicionApi, edicionPdfUrl } from "@/lib/api";
import { IconDownload, IconMail, IconAlert, IconSpark } from "@/components/icons";
import EnviarInformeModal from "@/components/informes/EnviarInformeModal";
import Truncado from "@/components/informes/Truncado";
import { ESTADO_EDICION } from "@/components/informes/estudioUtils";

// Ediciones de un informe: cada generación queda archivada con su PDF tal como salió ese día y con quién la envió.
// Debajo, toda la actividad del informe (de Auditoría).

const PAGE_SIZES = [25, 50, 100];
const COLOR_ACCION = { enviar: "var(--good)", descargar: "var(--accent)", generar: "var(--secondary)", crear: "var(--muted)", editar: "var(--warning)", eliminar: "var(--critical)" };


// Cuándo se envió y cuánto tardó desde que se generó; si sigue pendiente, hace cuánto espera.
function duracion(ms) {
  const min = Math.max(0, Math.round(ms / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} días`;
}

function momentoEnvio(e) {
  if (e.estado === "enviado" && e.enviadoAt) {
    return (
      <span>
        <span className="mono">{new Date(e.enviadoAt).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
        <span className="muted" style={{ fontSize: 12, display: "block" }}>{duracion(new Date(e.enviadoAt) - new Date(e.createdAt))} después de generarse</span>
      </span>
    );
  }
  if (e.estado === "por_enviar") {
    return <span style={{ color: "var(--warning)", fontWeight: 600, fontSize: 12.5 }}>Esperando hace {duracion(Date.now() - new Date(e.createdAt))}</span>;
  }
  return <span className="muted">—</span>;
}

export default function EdicionesPanel({ reportId, puedeGenerar }) {
  const [ediciones, setEdiciones] = useState(null);
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState("");
  const [generando, setGenerando] = useState(false);
  const [enviar, setEnviar] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);

  const cargar = useCallback(async () => {
    try {
      const [e, a] = await Promise.all([fetchEdicionesApi(reportId), fetchActividadInformeApi(reportId)]);
      setEdiciones(e.ediciones || []);
      setLogs(a.logs || []);
    } catch (err) {
      setError(err.message || "No se pudieron cargar las ediciones.");
    }
  }, [reportId]);

  useEffect(() => { cargar(); }, [cargar]);

  const lista = ediciones || [];
  const totalPages = Math.max(1, Math.ceil(lista.length / pageSize));
  const current = Math.min(page, totalPages);
  const visibles = lista.slice((current - 1) * pageSize, current * pageSize);
  useEffect(() => { setPage(1); }, [pageSize]);


  async function generarAhora() {
    setGenerando(true);
    setError("");
    try {
      const r = await generarEdicionApi(reportId, "manual");
      await cargar();
      if (r.edicion?.estado === "por_enviar") setEnviar(r.edicion.id);
    } catch (e) {
      setError(e.message || "No se pudo generar.");
    } finally {
      setGenerando(false);
    }
  }


  return (
    <div className="est">
      <div className="est-row">
        <section className="est-card est-grow" style={{ display: "flex", flexDirection: "column", gap: 12 }} aria-labelledby="ed-t">
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div>
              <h2 id="ed-t">Historial de envíos</h2>
              <p className="est-sub">Cada vez que el informe se genera queda aquí su PDF tal como salió ese día y quién lo envió.</p>
            </div>
            <div className="spacer" />
            {puedeGenerar && (
              <button type="button" className="btn btn-primary" onClick={generarAhora} disabled={generando}>
                {generando ? <><span className="spinner" /> Generando…</> : <><IconSpark size={13} /> Generar ahora</>}
              </button>
            )}
          </div>
          {error && <div className="modal-error"><IconAlert size={13} /> {error}</div>}
          {ediciones === null ? (
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}><span className="spinner" /> Cargando…</div>
          ) : lista.length === 0 ? (
            <div className="empty">Todavía no hay envíos de este informe. Aparecen cuando llega la fecha programada o con &quot;Generar ahora&quot;.</div>
          ) : (
            <div className="table-scroll">
              <table className="audit-log">
                <thead><tr><th>Período</th><th>Generada</th><th>Estado</th><th>Enviado el</th><th>Para</th><th></th></tr></thead>
                <tbody>
                  {visibles.map((e) => {
                    const est = ESTADO_EDICION[e.estado] || { label: e.estado, cls: "off" };
                    return (
                      <tr key={e.id}>
                        <td>
                          <strong>{e.periodoLabel}</strong>
                          {e.origen !== "programado" && <span className="est-chip off" style={{ marginLeft: 6 }}>{e.origen === "prueba" ? "Prueba" : "Manual"}</span>}
                        </td>
                        <td className="mono" style={{ whiteSpace: "nowrap" }}>{new Date(e.createdAt).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                        <td className="truncate" style={{ maxWidth: 260 }}>
                          <span className={`est-chip ${est.cls}`} title={e.motivo || undefined}>
                            {e.estado === "enviado" ? `Enviado${e.enviadoPorNombre ? ` por ${e.enviadoPorNombre}` : ""}` : est.label}
                          </span>
                          {e.motivo && e.estado !== "enviado" && <span style={{ display: "block", marginTop: 4, fontSize: 12 }} className="muted"><Truncado v={e.motivo} max={240} /></span>}
                        </td>
                        <td style={{ whiteSpace: "nowrap" }}>{momentoEnvio(e)}</td>
                        <td>
                          {e.destinatarios?.length ? (
                            <span className="desc-tooltip-wrap" style={{ display: "inline-block" }}>
                              <span className="desc-text" style={{ maxWidth: 140 }}>{e.destinatarios.length} persona(s)</span>
                              <span className="desc-tooltip-bubble">{[...e.destinatarios, ...(e.cc || []).map((x) => `CC: ${x}`)].join(", ")}</span>
                            </span>
                          ) : <span className="muted">—</span>}
                        </td>
                        <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                          <span style={{ display: "inline-flex", gap: 6 }}>
                            {e.tienePdf && <a className="btn small" href={edicionPdfUrl(e.id)} download={e.archivo}><IconDownload size={12} /> PDF</a>}
                            {e.estado === "por_enviar" && <button type="button" className="btn small btn-primary" onClick={() => setEnviar(e.id)}><IconMail size={12} /> Enviar</button>}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {lista.length > 0 && (
            <div className="table-footer">
              <div className="field" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <label style={{ marginBottom: 0 }}>Tamaño</label>
                <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} style={{ width: "auto" }}>
                  {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div className="page-btns">
                <button type="button" className="btn small" disabled={current <= 1} onClick={() => setPage(current - 1)}>Anterior</button>
                <button type="button" className="btn small" disabled={current >= totalPages} onClick={() => setPage(current + 1)}>Siguiente</button>
              </div>
              <span className="count-note">Página {current} de {totalPages}</span>
              <div className="spacer" />
              <span className="count-note">{lista.length} envío(s)</span>
            </div>
          )}
        </section>

      </div>

      <section className="est-card" style={{ display: "flex", flexDirection: "column", gap: 14 }} aria-labelledby="act-t">
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h2 id="act-t">Actividad del informe</h2>
          <div className="spacer" />
          <span className="muted" style={{ fontSize: 12.5 }}>También queda en Auditoría</span>
        </div>
        {logs.length === 0 ? (
          <p className="est-sub" style={{ margin: 0 }}>Sin actividad todavía.</p>
        ) : (
          <ol className="est-tl">
            {logs.slice(0, 15).map((l) => (
              <li key={l.id}>
                <i style={{ background: COLOR_ACCION[l.action] || "var(--muted)" }} />
                <span>
                  <strong>{l.recordInfo || l.action}</strong>
                  <br />
                  <span className="muted" style={{ fontSize: 12.5 }}>{l.userNombre || "Sistema"} · {new Date(l.createdAt).toLocaleString("es-CO", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                  {l.changes?.length ? <span className="muted" style={{ fontSize: 12 }}> · cambió {l.changes.map((c) => c.label).slice(0, 4).join(", ")}{l.changes.length > 4 ? "…" : ""}</span> : null}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {enviar && <EnviarInformeModal edicionId={enviar} onClose={() => setEnviar(null)} onEnviado={() => cargar()} />}
    </div>
  );
}
