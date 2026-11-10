"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchEdicionesApi, fetchEdicionContenidoApi, edicionPdfUrl } from "@/lib/api";
import { IconDownload, IconEye, IconAlert } from "@/components/icons";
import DocumentoA4 from "@/components/informes/DocumentoA4";

// Fotos guardadas de un informe solo para consultar: cada vez que alguien pulsa "Guardar foto" queda el informe tal
// como estaba ese día (con su PDF). Como el informe se actualiza solo, las fotos son el histórico de lo que mostró.
const PAGE_SIZES = [25, 50, 100];

export default function FotosPanel({ reportId }) {
  const [fotos, setFotos] = useState(null);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
  const [viendo, setViendo] = useState(null); // { id, content, informe, ... }
  const [abriendo, setAbriendo] = useState(null);

  const cargar = useCallback(async () => {
    try {
      const r = await fetchEdicionesApi(reportId);
      setFotos((r.ediciones || []).filter((e) => e.estado === "guardado"));
    } catch (e) {
      setError(e.message || "No se pudieron cargar las fotos.");
    }
  }, [reportId]);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { setPage(1); }, [pageSize]);

  async function ver(id) {
    setAbriendo(id);
    setError("");
    try {
      setViendo(await fetchEdicionContenidoApi(id));
    } catch (e) {
      setError(e.message || "No se pudo abrir la foto.");
    } finally {
      setAbriendo(null);
    }
  }

  const lista = fotos || [];
  const totalPages = Math.max(1, Math.ceil(lista.length / pageSize));
  const current = Math.min(page, totalPages);
  const visibles = lista.slice((current - 1) * pageSize, current * pageSize);

  if (viendo) {
    return (
      <div className="est">
        <div className="est-card" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "12px 16px" }}>
          <button type="button" className="btn small" onClick={() => setViendo(null)}>← Volver a las fotos</button>
          <span className="est-chip">Foto · {viendo.periodoLabel}</span>
          <span className="muted" style={{ fontSize: 12.5 }}>
            Guardada el {new Date(viendo.createdAt).toLocaleString("es-CO", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}{viendo.creadoPorNombre ? ` por ${viendo.creadoPorNombre}` : ""}. Así estaba el informe ese día.
          </span>
          <div className="spacer" />
          <a className="btn small" href={edicionPdfUrl(viendo.id)}><IconDownload size={12} /> PDF</a>
        </div>
        <div className="est-desk" style={{ borderRadius: 16 }}>
          <DocumentoA4 informe={viendo.informe} content={viendo.content} cargando={false} seleccion={null} onSeleccion={() => {}} onAccion={() => {}} onCifra={() => {}} />
        </div>
      </div>
    );
  }

  return (
    <section className="est-card" style={{ display: "flex", flexDirection: "column", gap: 12 }} aria-labelledby="fotos-t">
      <div>
        <h2 id="fotos-t">Fotos guardadas</h2>
        <p className="est-sub">Este informe se actualiza solo. Cada vez que pulses <strong>Guardar foto</strong> en &quot;Ver informe&quot; queda aquí cómo estaba ese día, para consultarlo después.</p>
      </div>
      {error && <div className="modal-error"><IconAlert size={13} /> {error}</div>}
      {fotos === null ? (
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}><span className="spinner" /> Cargando…</div>
      ) : lista.length === 0 ? (
        <div className="empty">Todavía no hay fotos guardadas de este informe.</div>
      ) : (
        <div className="table-scroll">
          <table className="audit-log">
            <thead><tr><th>Guardada el</th><th>Período</th><th>Guardada por</th><th></th></tr></thead>
            <tbody>
              {visibles.map((f) => (
                <tr key={f.id}>
                  <td className="mono" style={{ whiteSpace: "nowrap" }}>{new Date(f.createdAt).toLocaleString("es-CO", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                  <td><strong>{f.periodoLabel}</strong></td>
                  <td>{f.creadoPorNombre || "—"}</td>
                  <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                    <span style={{ display: "inline-flex", gap: 6 }}>
                      <button type="button" className="btn small btn-primary" onClick={() => ver(f.id)} disabled={abriendo === f.id}>{abriendo === f.id ? <span className="spinner" /> : <IconEye size={12} />} Ver</button>
                      <a className="btn small" href={edicionPdfUrl(f.id)} download={f.archivo}><IconDownload size={12} /> PDF</a>
                    </span>
                  </td>
                </tr>
              ))}
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
          <span className="count-note">{lista.length} foto(s)</span>
        </div>
      )}
    </section>
  );
}
