"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { reviewAlertasApi } from "@/lib/api";
import { fmtCOP, fmtDateDisplay } from "@/lib/format";
import { IconSpark, IconAlert, IconCheck, IconClock, IconArrowRight } from "@/components/icons";
import { TimelineButton } from "@/components/RecordTimelineModal";

// Botón "Ir" de cada fila: lleva a Registros con el buscador ya cargado con
// el número de registro (#123, el mismo "search" de texto libre de
// RegistrosView.jsx) para llegar directo a esa compra sin tener que
// reescribirlo a mano.
function IrARegistro({ localSeq }) {
  const router = useRouter();
  if (!localSeq) return null;
  return (
    <button
      type="button" className="btn small ir-registro-btn"
      onClick={() => router.push(`/registros?q=${encodeURIComponent(`#${localSeq}`)}`)}
      title={`Ir al registro #${localSeq} en Registros`}
    >
      Ir <IconArrowRight size={11} />
    </button>
  );
}

const PAGE_SIZE = 10;

function diasPillClass(dias) {
  if (dias > 8) return "critical";
  if (dias > 0) return "warning";
  return "muted";
}

function presupuestoPillClass(estado) {
  if (estado === "excedido") return "critical";
  if (estado === "alerta") return "warning";
  if (estado === "ok") return "good";
  return "muted";
}

function presupuestoLabel(estado) {
  if (estado === "excedido") return "Excedido";
  if (estado === "alerta") return "En alerta";
  if (estado === "ok") return "Dentro de presupuesto";
  return "Sin presupuesto";
}

// Página siempre vuelve a 1 cuando cambian los datos (p.ej. al recargar la
// página), así que es un simple estado local por tabla — no hace falta un
// hook más elaborado, cada sección pagina de forma independiente.
function usePageSlice(items, pageSize = PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  return { pageItems: items.slice(start, start + pageSize), page: safePage, totalPages, setPage };
}

function TableFooter({ page, totalPages, onPageChange, total, label }) {
  if (total <= PAGE_SIZE) return null;
  return (
    <div className="table-footer">
      <div className="page-btns">
        <button type="button" className="btn small" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Anterior</button>
        <button type="button" className="btn small" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>Siguiente</button>
      </div>
      <span className="count-note">Página {page} de {totalPages}</span>
      <div className="spacer" />
      <span className="count-note">{total} {label}</span>
    </div>
  );
}

// "Revisar con Nova" de esta página — mismo patrón no streaming que
// "Explícame este número" (ver DashboardView.jsx#KpiExplain), pero el
// análisis cubre las tres secciones a la vez (solicitudes pendientes,
// presupuesto, tiempos de entrega) en vez de un solo KPI.
function RevisarConIA() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  async function handleClick() {
    setOpen(true);
    setLoading(true);
    setError("");
    try {
      const res = await reviewAlertasApi();
      setResult(res);
    } catch (err) {
      setError(err.message || "No se pudo generar el análisis.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="kpi-explain">
      <button type="button" className="btn btn-sync" onClick={handleClick} disabled={loading}>
        {loading ? <span className="spinner" /> : <IconSpark size={14} />} {loading ? "Analizando…" : "Revisar con Nova"}
      </button>
      {open && (
        <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="modal kpi-explain-modal">
            <div className="modal-head">
              <div className="kpi-explain-modal-title">
                <span className="kpi-explain-modal-ic"><IconSpark size={16} /></span>
                <div>
                  <h3>Análisis de alertas</h3>
                  <p className="card-sub" style={{ margin: 0 }}>Solicitudes pendientes, presupuesto y tiempos de entrega</p>
                </div>
              </div>
              <button type="button" className="btn-ghost icon-btn" onClick={() => setOpen(false)} aria-label="Cerrar">✕</button>
            </div>
            <div className="modal-body">
              {loading && (
                <div className="kpi-explain-loading"><span className="spinner" /> Analizando la situación actual…</div>
              )}
              {!loading && error && <div className="modal-error"><IconAlert size={13} /> {error}</div>}
              {!loading && !error && result && (
                <>
                  <h4 style={{ margin: "0 0 4px" }}>Resumen</h4>
                  <p style={{ margin: "0 0 14px", fontSize: 13.5, lineHeight: 1.5 }}>{result.resumen}</p>
                  <h4 style={{ margin: "0 0 4px" }}>Riesgos</h4>
                  <p style={{ margin: "0 0 14px", fontSize: 13.5, lineHeight: 1.5 }}>{result.riesgos}</p>
                  <h4 style={{ margin: "0 0 4px" }}>Proyección</h4>
                  <p style={{ margin: "0 0 14px", fontSize: 13.5, lineHeight: 1.5 }}>{result.proyeccion}</p>
                  {result.sugerencias?.length > 0 && (
                    <>
                      <h4 style={{ margin: "0 0 4px" }}>Sugerencias</h4>
                      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.6 }}>
                        {result.sugerencias.map((s, i) => <li key={i}>{s}</li>)}
                      </ul>
                    </>
                  )}
                </>
              )}
            </div>
            <div className="modal-foot">
              <button type="button" className="btn" onClick={() => setOpen(false)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SolicitudesPendientes({ items }) {
  const { pageItems, page, totalPages, setPage } = usePageSlice(items);
  return (
    <div className="table-card" style={{ marginTop: 18 }}>
      <div className="modal-head" style={{ border: "none", paddingBottom: 14, flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
        <h3>Solicitudes pendientes ({items.length})</h3>
        <p className="card-sub" style={{ margin: 0 }}>
          Compras sin fecha de entrega, con estado Pendiente, Proceso o sin definir. Los días hábiles se cuentan desde la fecha de solicitud hasta hoy (excluye fines de semana y festivos), ordenadas de más a menos atrasadas.
        </p>
      </div>
      {items.length === 0 ? (
        <div className="empty">No hay solicitudes pendientes de entrega.</div>
      ) : (
        <>
          <table className="audit-log">
            <thead>
              <tr>
                <th>#</th>
                <th>Descripción</th>
                <th>Área</th>
                <th>Responsable</th>
                <th>F. solicitud</th>
                <th>Días hábiles</th>
                <th>Estado</th>
                <th>Observaciones</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{r.localSeq ? `#${r.localSeq}` : "—"}</td>
                  <td className="truncate wide" title={r.descripcion || ""}>{r.descripcion || "—"}</td>
                  <td>{r.area || "—"}</td>
                  <td>{r.responsable || "—"}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{fmtDateDisplay(r.fechaSolicitud)}</td>
                  <td><span className={`pill ${diasPillClass(r.diasHabiles)}`}><IconClock size={11} /> {r.diasHabiles}</span></td>
                  <td>{r.estado || "—"}</td>
                  <td className="truncate wide" title={r.observaciones || ""}>{r.observaciones || "—"}</td>
                  <td style={{ display: "flex", gap: 6 }}><TimelineButton recordId={r.id} localSeq={r.localSeq} /><IrARegistro localSeq={r.localSeq} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <TableFooter page={page} totalPages={totalPages} onPageChange={setPage} total={items.length} label="solicitud(es)" />
        </>
      )}
    </div>
  );
}

function RiesgoTiempos({ items }) {
  const { pageItems, page, totalPages, setPage } = usePageSlice(items);
  return (
    <div className="table-card" style={{ marginTop: 18 }}>
      <div className="modal-head" style={{ border: "none", paddingBottom: 14, flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
        <h3>Mayor tiempo de solicitud a entrega — sobre el límite ({items.length})</h3>
        <p className="card-sub" style={{ margin: 0 }}>
          Compras (entregadas o aún pendientes) cuyo tiempo entre la fecha de solicitud y la de entrega —o hasta hoy, si sigue pendiente— superó el límite (SLA) de 8 días hábiles. Ordenadas de mayor a menor atraso.
        </p>
      </div>
      {items.length === 0 ? (
        <div className="empty">
          <IconCheck size={13} /> No hay compras fuera del plazo de 8 días hábiles.
        </div>
      ) : (
        <>
          <table className="audit-log">
            <thead>
              <tr>
                <th>#</th>
                <th>Descripción</th>
                <th>Área</th>
                <th>Proveedor</th>
                <th>Días hábiles</th>
                <th>Estado</th>
                <th>Observaciones</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{r.localSeq ? `#${r.localSeq}` : "—"}</td>
                  <td className="truncate wide" title={r.descripcion || ""}>{r.descripcion || "—"}</td>
                  <td>{r.area || "—"}</td>
                  <td>{r.proveedor || "—"}</td>
                  <td><span className={`pill ${diasPillClass(r.diasHabiles)}`}><IconClock size={11} /> {r.diasHabiles}</span></td>
                  <td>{r.entregado ? "Entregada tarde" : "Aún pendiente"}</td>
                  <td className="truncate wide" title={r.observaciones || ""}>{r.observaciones || "—"}</td>
                  <td style={{ display: "flex", gap: 6 }}><TimelineButton recordId={r.id} localSeq={r.localSeq} /><IrARegistro localSeq={r.localSeq} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <TableFooter page={page} totalPages={totalPages} onPageChange={setPage} total={items.length} label="compra(s)" />
        </>
      )}
    </div>
  );
}

function RiesgoPresupuesto({ items }) {
  const { pageItems, page, totalPages, setPage } = usePageSlice(items);
  return (
    <div className="table-card" style={{ marginTop: 18 }}>
      <div className="modal-head" style={{ border: "none", paddingBottom: 14, flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
        <h3>Áreas más cerca del límite de presupuesto</h3>
        <p className="card-sub" style={{ margin: 0 }}>
          % del presupuesto asignado para {new Date().getFullYear()} ya gastado por área (suma de compras registradas este año), de mayor a menor. "En alerta" desde 80% gastado, "Excedido" desde 90%.
        </p>
      </div>
      {items.length === 0 ? (
        <div className="empty">No hay presupuesto configurado para el año actual.</div>
      ) : (
        <>
          <table className="audit-log">
            <thead>
              <tr>
                <th>Área</th>
                <th>Presupuestado</th>
                <th>Gastado</th>
                <th>% consumido</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((p) => (
                <tr key={p.area}>
                  <td>{p.area}</td>
                  <td>{fmtCOP(p.presupuestado)}</td>
                  <td>{fmtCOP(p.gastado)}</td>
                  <td>{p.porcentaje != null ? `${p.porcentaje}%` : "—"}</td>
                  <td><span className={`pill ${presupuestoPillClass(p.estado)}`}>{presupuestoLabel(p.estado)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          <TableFooter page={page} totalPages={totalPages} onPageChange={setPage} total={items.length} label="área(s)" />
        </>
      )}
    </div>
  );
}

function NoRadicadas({ items }) {
  const { pageItems, page, totalPages, setPage } = usePageSlice(items);
  return (
    <div className="table-card" style={{ marginTop: 18 }}>
      <div className="modal-head" style={{ border: "none", paddingBottom: 14, flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
        <h3>Compras legalizadas sin radicar ({items.length})</h3>
        <p className="card-sub" style={{ margin: 0 }}>
          Ya pasaron por legalización ("Legalizado") pero todavía no se han radicado — el último paso del trámite sigue pendiente. Ordenadas por fecha de solicitud, las más antiguas primero.
        </p>
      </div>
      {items.length === 0 ? (
        <div className="empty">
          <IconCheck size={13} /> No hay compras legalizadas pendientes de radicar.
        </div>
      ) : (
        <>
          <table className="audit-log">
            <thead>
              <tr>
                <th>#</th>
                <th>Descripción</th>
                <th>Área</th>
                <th>Responsable</th>
                <th>Proveedor</th>
                <th>F. solicitud</th>
                <th>Valor + IVA</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{r.localSeq ? `#${r.localSeq}` : "—"}</td>
                  <td className="truncate wide" title={r.descripcion || ""}>{r.descripcion || "—"}</td>
                  <td>{r.area || "—"}</td>
                  <td>{r.responsable || "—"}</td>
                  <td>{r.proveedor || "—"}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{fmtDateDisplay(r.fechaSolicitud)}</td>
                  <td>{fmtCOP(r.valorConIva)}</td>
                  <td style={{ display: "flex", gap: 6 }}><TimelineButton recordId={r.id} localSeq={r.localSeq} /><IrARegistro localSeq={r.localSeq} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <TableFooter page={page} totalPages={totalPages} onPageChange={setPage} total={items.length} label="compra(s)" />
        </>
      )}
    </div>
  );
}

export default function AlertasView({ initialData }) {
  const { solicitudesPendientes = [], riesgoPresupuesto = [], riesgoTiempos = [], noRadicadas = [] } = initialData || {};

  return (
    <div>
      <div className="view-head" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <p className="card-sub" style={{ margin: 0, maxWidth: 680 }}>
          Vista rápida de lo que necesita atención ahora mismo: solicitudes sin entregar, compras que ya superaron el tiempo esperado de entrega, áreas más cerca de agotar su presupuesto y compras legalizadas sin radicar.
        </p>
        <RevisarConIA />
      </div>

      <SolicitudesPendientes items={solicitudesPendientes} />
      <RiesgoTiempos items={riesgoTiempos} />
      <RiesgoPresupuesto items={riesgoPresupuesto} />
      <NoRadicadas items={noRadicadas} />
    </div>
  );
}
