"use client";

import { useEffect, useMemo, useState } from "react";
import { fmtCOP } from "@/lib/format";
import { asociarCompraApi, fetchActividadesApi, fetchComprasSinActividadApi } from "@/lib/api";
import PiePagina, { usePagina, PAGE_SIZES_MODAL } from "@/components/bienestar/PiePagina";

const entero = (v) => Math.round(v || 0).toLocaleString("es-CO");

// Tarjeta del Resumen: las compras del área Bienestar que no están asociadas a ninguna actividad no suman en el tablero
// (solo cuenta lo asociado), así que se muestran aparte con su monto, y quien edita las asocia desde aquí.
export default function ComprasSinActividad({ datos, anio, mes, linea, periodo, puedeEditar, onCambio }) {
  const [abierto, setAbierto] = useState(false);
  if (!datos?.compras) return null;
  return (
    <section className="resumen-card sin-actividad" aria-labelledby="sin-actividad-t">
      <div className="sin-actividad-texto">
        <h2 id="sin-actividad-t">Compras del área {datos.areas.join(", ")} sin actividad</h2>
        <p className="card-sub">
          {entero(datos.compras)} compra(s) por <strong>{fmtCOP(datos.valor)}</strong> en {periodo} que no están asociadas a ninguna actividad: no suman en este tablero hasta asociarlas.
        </p>
      </div>
      <button type="button" className="btn" onClick={() => setAbierto(true)}>{puedeEditar ? "Ver y asociar" : "Ver compras"}</button>
      {abierto && <ModalAsociar anio={anio} mes={mes} linea={linea} puedeEditar={puedeEditar} onClose={() => setAbierto(false)} onCambio={onCambio} />}
    </section>
  );
}

function ModalAsociar({ anio, mes, linea, puedeEditar, onClose, onCambio }) {
  const [compras, setCompras] = useState(null);
  const [actividades, setActividades] = useState([]);
  const [eleccion, setEleccion] = useState({});
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  useEffect(() => {
    fetchComprasSinActividadApi(anio, mes).then((r) => setCompras(r.compras)).catch((e) => setError(e.message));
    if (puedeEditar) {
      fetchActividadesApi(anio)
        .then((r) => setActividades((r.actividades || r).filter((a) => a.linea === linea && a.estado !== "cerrada" && a.fecha)))
        .catch(() => setActividades([]));
    }
  }, [anio, mes, linea, puedeEditar]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const lista = useMemo(() => compras || [], [compras]);
  const pag = usePagina(lista, "", PAGE_SIZES_MODAL[0]);

  async function asociar(c) {
    const actividadId = eleccion[c.id];
    if (!actividadId) return;
    setError("");
    setAviso("");
    try {
      await asociarCompraApi(actividadId, c.id);
      setCompras((l) => l.filter((x) => x.id !== c.id));
      setAviso(`La compra #${c.localSeq ?? ""} quedó asociada a ${actividades.find((a) => String(a.id) === String(actividadId))?.nombre || "la actividad"}.`);
      onCambio();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal sin-actividad-modal" role="dialog" aria-modal="true" aria-labelledby="sin-act-modal-t">
        <div className="modal-head">
          <h3 id="sin-act-modal-t">Compras sin actividad</h3>
          <button type="button" className="btn-ghost icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div className="modal-body" style={{ display: "block" }}>
          <p className="count-note" style={{ marginTop: 0 }}>Del área Bienestar{mes ? `, ${String(mes).padStart(2, "0")}/${anio}` : `, ${anio}`}. {puedeEditar ? "Elige la actividad de cada una y asóciala: pasa a sumar en el tablero." : "Quien edita Bienestar puede asociarlas a su actividad."}</p>
          {aviso && <div className="ficha-aviso" role="status">{aviso}</div>}
          {error && <div className="modal-error">{error}</div>}
          <div className="table-card">
            <div className="table-scroll">
              <table className="records ficha-tabla">
                <thead><tr><th>#</th><th>Solicitud</th><th>Descripción</th><th className="num">Valor con IVA</th>{puedeEditar && <th>Actividad</th>}{puedeEditar && <th className="actions-col">Acciones</th>}</tr></thead>
                <tbody>
                  {compras === null && <tr><td colSpan={6}><div className="skeleton-bar" style={{ height: 34, borderRadius: 8 }} /></td></tr>}
                  {compras !== null && pag.pagina.length === 0 && <tr><td colSpan={6}><div className="empty">No quedan compras sin actividad.</div></td></tr>}
                  {pag.pagina.map((c) => (
                    <tr key={c.id}>
                      <td className="mono">#{c.localSeq ?? "—"}</td>
                      <td>{c.fechaSolicitud || "—"}</td>
                      <td><span className="desc-tooltip-wrap"><span className="desc-text">{c.descripcion || "—"}</span><span className="desc-tooltip-bubble">{c.descripcion}{c.proveedor ? ` · ${c.proveedor}` : ""}</span></span></td>
                      <td className="num">{fmtCOP(c.valorConIva || 0)}</td>
                      {puedeEditar && (
                        <td>
                          <select aria-label={`Actividad para la compra ${c.localSeq ?? ""}`} value={eleccion[c.id] || ""} onChange={(e) => setEleccion((x) => ({ ...x, [c.id]: e.target.value }))}>
                            <option value="">Elige la actividad…</option>
                            {actividades.map((a) => <option key={a.id} value={a.id}>{a.fecha} · {a.nombre}</option>)}
                          </select>
                        </td>
                      )}
                      {puedeEditar && (
                        <td className="actions-cell"><button type="button" className="btn small" disabled={!eleccion[c.id]} onClick={() => asociar(c)}>Asociar</button></td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PiePagina id="sin-act-size" p={pag} total={lista.length} etiqueta="compra(s)" tamanos={PAGE_SIZES_MODAL} />
          </div>
        </div>
      </div>
    </div>
  );
}
