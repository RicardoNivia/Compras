"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fmtDateTime } from "@/lib/format";
import { generarCompraDeSolicitudApi, rechazarSolicitudApi } from "@/lib/api";
import RecordModal from "@/components/RecordModal";
import { IconCheck } from "@/components/icons";
import { EVENTO_REVISAR } from "@/components/notificaciones/AvisosEnVivo";

const PAGE_SIZES = [25, 50, 100];
const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function Texto({ valor }) {
  if (!valor) return <span className="muted">—</span>;
  return (
    <span className="desc-tooltip-wrap">
      <span className="desc-text">{valor}</span>
      <span className="desc-tooltip-bubble">{valor}</span>
    </span>
  );
}

// Los datos de la solicitud, en los campos del formulario de Compras. El área es la de Bienestar, el responsable quien
// la pidió si está en el maestro de responsables, y el proveedor se llena si el sugerido coincide con el catálogo; lo
// demás lo completa quien crea la compra.
function datosDelFormulario(s, maestros, proveedores) {
  const area = maestros.find((m) => m.tipo === "area" && norm(m.valor) === "bienestar");
  const responsable = maestros.find((m) => m.tipo === "responsable" && m.userId && m.userId === s.creadoPorUserId);
  const proveedor = s.proveedorSugerido ? proveedores.find((p) => norm(p.nombre) === norm(s.proveedorSugerido) || String(p.nit) === String(s.proveedorSugerido).trim()) : null;
  const notas = [s.observaciones, s.fechaRequerida ? `Para el ${s.fechaRequerida}.` : null, s.proveedorSugerido && !proveedor ? `Proveedor sugerido: ${s.proveedorSugerido}.` : null, `Solicitud de ${s.creadoPorNombre || "Bienestar"} para la actividad ${s.actividad}.`].filter(Boolean).join(" ");
  return {
    fechaSolicitud: hoyISO(),
    descripcion: s.descripcion,
    actividadId: s.actividadId,
    observaciones: notas,
    ...(s.valorEstimado != null ? { valorConIva: s.valorEstimado } : {}),
    ...(s.categoriaId ? { categoriaId: s.categoriaId, categoria: s.categoria } : {}),
    ...(area ? { areaId: area.id, area: area.valor } : {}),
    ...(responsable ? { responsableUserId: responsable.userId, responsable: responsable.valor } : {}),
    ...(proveedor ? { proveedorNit: proveedor.nit, nit: proveedor.nit, proveedor: proveedor.nombre } : {}),
  };
}

// Pestaña "Solicitudes de compra" de Alertas y notificaciones. Solo la ve quien puede crear compras: cada solicitud
// sigue aquí hasta que se genere la compra o se rechace.
export default function SolicitudesCompraView({ initialSolicitudes = [], records = [], maestros = [], proveedores = [], presupuestos = [], actividades = [] }) {
  const router = useRouter();
  const [solicitudes, setSolicitudes] = useState(initialSolicitudes);
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [generar, setGenerar] = useState(null);
  const [rechazar, setRechazar] = useState(null);
  const [aviso, setAviso] = useState("");

  const filtradas = useMemo(() => {
    const q = norm(search);
    return solicitudes.filter((s) => !q || [s.descripcion, s.actividad, s.creadoPorNombre, s.proveedorSugerido, s.categoria].some((v) => norm(v).includes(q)));
  }, [solicitudes, search]);
  useEffect(() => { setPage(1); }, [search, pageSize]);
  const totalPages = Math.max(1, Math.ceil(filtradas.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtradas.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function quitar(id, mensaje) {
    setSolicitudes((l) => l.filter((s) => s.id !== id));
    setAviso(mensaje);
    router.refresh(); // actualiza el contador de la pestaña
  }

  return (
    <div className="solicitudes-compra">
      <div className="view-head">
        <div className="field search-field" style={{ maxWidth: 340 }}>
          <label htmlFor="sc-search">Buscar</label>
          <input id="sc-search" type="search" placeholder="Qué se pide, actividad o quién la pidió…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>
      {aviso && <div className="ficha-aviso" role="status"><IconCheck size={13} /> {aviso}</div>}

      <div className="table-card">
        <div className="table-scroll">
          <table className="records solicitudes-tabla">
            <thead>
              <tr>
                <th>Solicitada</th>
                <th>Actividad</th>
                <th>Qué se pide</th>
                <th>Debe llegar</th>
                <th>Quién la pidió</th>
                <th className="actions-col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 && (
                <tr><td colSpan={6}><div className="empty">{solicitudes.length ? "Ninguna solicitud coincide con la búsqueda." : "No hay solicitudes de compra pendientes."}</div></td></tr>
              )}
              {pageRows.map((s) => (
                <tr key={s.id}>
                  <td className="mono">{fmtDateTime(s.createdAt)}</td>
                  <td><Texto valor={`${s.actividad} · ${s.linea}`} /></td>
                  <td><Texto valor={s.descripcion} /></td>
                  <td className="mono">{s.fechaRequerida || "—"}</td>
                  <td><Texto valor={s.creadoPorNombre} /></td>
                  <td className="actions-cell">
                    <div className="row-actions">
                      <button type="button" className="btn small btn-primary" onClick={() => setGenerar(s)}>Generar compra</button>
                      <button type="button" className="btn small btn-danger-outline" onClick={() => setRechazar(s)}>Rechazar</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="table-footer">
          <div className="field" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <label htmlFor="sc-pagesize" style={{ marginBottom: 0 }}>Tamaño</label>
            <select id="sc-pagesize" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
              {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="page-btns">
            <button type="button" className="btn small" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Anterior</button>
            <button type="button" className="btn small" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>Siguiente</button>
          </div>
          <span className="count-note">Página {currentPage} de {totalPages}</span>
          <div className="spacer" />
          <span className="count-note">{filtradas.length} solicitud(es) pendiente(s)</span>
        </div>
      </div>

      {generar && (
        <RecordModal
          record={null}
          records={records}
          maestros={maestros}
          proveedores={proveedores}
          presupuestos={presupuestos}
          actividades={actividades}
          actividadFija={`${generar.actividad} · ${generar.linea}`}
          prefill={datosDelFormulario(generar, maestros, proveedores)}
          crear={(payload) => generarCompraDeSolicitudApi(generar.id, payload).then((r) => { window.dispatchEvent(new Event(EVENTO_REVISAR)); return r; })}
          onClose={() => setGenerar(null)}
          onSaved={(saved) => {
            const id = generar.id;
            setGenerar(null);
            quitar(id, `Compra #${saved.localSeq ?? ""} creada y asociada a la actividad.`);
          }}
        />
      )}
      {rechazar && (
        <ModalRechazar
          solicitud={rechazar}
          onClose={() => setRechazar(null)}
          onRechazada={() => { const id = rechazar.id; setRechazar(null); quitar(id, "Solicitud rechazada. Quien la pidió verá el motivo en la actividad."); }}
        />
      )}
    </div>
  );
}

function ModalRechazar({ solicitud, onClose, onRechazada }) {
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function confirmar(e) {
    e.preventDefault();
    if (motivo.trim().length < 5) return setError("Indica por qué se rechaza la compra.");
    setSaving(true);
    setError("");
    try {
      await rechazarSolicitudApi(solicitud.id, motivo);
      window.dispatchEvent(new Event(EVENTO_REVISAR));
      onRechazada();
    } catch (err) {
      setError(err.message || "No se pudo rechazar la solicitud.");
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="sc-rechazar">
        <div className="modal-head">
          <h3 id="sc-rechazar">Rechazar solicitud de compra</h3>
          <button type="button" className="btn-ghost icon-btn" onClick={onClose} disabled={saving} aria-label="Cerrar">✕</button>
        </div>
        <form onSubmit={confirmar}>
          <div className="modal-body" style={{ display: "block" }}>
            <p className="card-sub" style={{ marginTop: 0 }}>{solicitud.descripcion} · {solicitud.actividad}</p>
            <div className="field">
              <label htmlFor="sc-motivo">¿Por qué se rechaza? *</label>
              <textarea id="sc-motivo" rows={3} autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Quien la pidió verá este motivo en la actividad" />
            </div>
            {error && <div className="modal-error" style={{ marginTop: 8 }}>{error}</div>}
          </div>
          <div className="modal-foot">
            <button type="submit" className="btn btn-danger-solid" disabled={saving}>{saving && <span className="spinner" />} Rechazar solicitud</button>
            <button type="button" className="btn" onClick={onClose} disabled={saving}>Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  );
}
