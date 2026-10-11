"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  fetchProveedorDetalle, cambiarEstadoCicloApi, setDocumentoCicloApi, cambiarClasificacionApi,
} from "@/lib/api";
import ProveedorFormModal from "@/components/proveedores/ProveedorFormModal";
import ProveedorAccionesModal from "@/components/proveedores/ProveedorAccionesModal";

const SIGUIENTE = {
  desactualizado: { estado: "en_proceso", label: "Solicitar documentos" },
  en_proceso: { estado: "en_aprobacion", label: "Enviar a aprobación" },
  en_aprobacion: { estado: "actualizado", label: "Marcar actualizado" },
  actualizado: null,
};

const TABS = [
  { key: "checklist", label: "Checklist" },
  { key: "historial", label: "Histórico por año" },
  { key: "datos", label: "Datos" },
];

// Ficha del proveedor dentro del maestro: estado del ciclo, checklist,
// acciones y el histórico anual. Todo cambio pasa por la API, que valida reglas.
export default function ProveedorDetalle({ proveedorId, areas = [], motivos = [], canEdit, onChanged }) {
  const [detalle, setDetalle] = useState(null);
  const [tab, setTab] = useState("checklist");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editando, setEditando] = useState(false);
  const [accion, setAccion] = useState(null);

  async function cargar(id) {
    try {
      setDetalle(await fetchProveedorDetalle(id));
      setError("");
    } catch (err) {
      setError(err.message || "No se pudo cargar el proveedor.");
    }
  }

  useEffect(() => {
    if (proveedorId) cargar(proveedorId);
    else setDetalle(null);
  }, [proveedorId]);

  async function ejecutar(fn) {
    setBusy(true);
    setError("");
    try {
      await fn();
      await cargar(proveedorId);
      onChanged?.();
    } catch (err) {
      setError(err.message || "No se pudo guardar el cambio.");
    } finally {
      setBusy(false);
    }
  }

  if (!proveedorId) {
    return (
      <aside className="prov-detail prov-detail-empty" aria-label="Detalle del proveedor">
        <p className="muted">Elige un proveedor de la lista para ver su checklist, su histórico y sus acciones.</p>
      </aside>
    );
  }
  if (!detalle) {
    return (
      <aside className="prov-detail" aria-label="Detalle del proveedor">
        {error ? <div className="modal-error">{error}</div> : <span className="spinner" />}
      </aside>
    );
  }

  const siguiente = detalle.ciclo ? SIGUIENTE[detalle.ciclo.estado] : null;
  const puedeActualizar = detalle.checklist.completos === detalle.checklist.total;
  const enCiclo = detalle.clasificacion === "actualizacion" || detalle.clasificacion === "nuevo";
  const alertaNivel = detalle.alerta?.nivel || "ok";

  return (
    <aside className="prov-detail" aria-label="Detalle del proveedor">
      <header className="prov-detail-head">
        <span className={`prov-tag prov-tag-${detalle.clasificacion}`}>{detalle.clasificacionLabel}</span>
        <h2>{detalle.nombre}</h2>
        <p className="muted mono">NIT {detalle.nit}{detalle.area ? ` · ${detalle.area}` : ""}{detalle.servicio ? ` · ${detalle.servicio}` : ""}</p>
      </header>

      <div className={`prov-alert prov-alert-${alertaNivel}`} role="status">
        <strong>{detalle.alerta?.titulo}</strong>
        <span>{detalle.alerta?.detalle}</span>
      </div>

      {error && <div className="modal-error">{error}</div>}

      {canEdit && (
        <div className="prov-actions">
          {enCiclo && detalle.ciclo && siguiente && (
            <button
              type="button" className="btn btn-primary small" disabled={busy || (siguiente.estado === "actualizado" && !puedeActualizar)}
              title={siguiente.estado === "actualizado" && !puedeActualizar ? "El checklist debe estar completo (6/6)" : undefined}
              onClick={() => ejecutar(() => cambiarEstadoCicloApi(proveedorId, siguiente.estado))}
            >
              {siguiente.label}
            </button>
          )}
          {enCiclo && detalle.ciclo && detalle.ciclo.estado !== "desactualizado" && (
            <button type="button" className="btn small" disabled={busy} onClick={() => ejecutar(() => cambiarEstadoCicloApi(proveedorId, "desactualizado"))}>
              Devolver a desactualizado
            </button>
          )}
          {detalle.esExcepcion ? (
            <button type="button" className="btn small" disabled={busy} onClick={() => ejecutar(() => cambiarClasificacionApi(proveedorId, { accion: "quitar-excepcion" }))}>
              Quitar excepción
            </button>
          ) : detalle.activo ? (
            <button type="button" className="btn small" onClick={() => setAccion("excepcion")}>Marcar excepción</button>
          ) : null}
        </div>
      )}

      <div role="tablist" aria-label="Secciones del proveedor" className="prov-tabs">
        {TABS.map((t) => (
          <button key={t.key} role="tab" type="button" aria-selected={tab === t.key} className="prov-tab" onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "checklist" && (
        <section aria-label="Checklist del ciclo">
          {!detalle.ciclo ? (
            <p className="muted">Este proveedor no participa en el ciclo de actualización{detalle.esExcepcion ? " (es excepción)" : detalle.activo ? "" : " (está inactivo)"}.</p>
          ) : (
            <>
              <p className="muted">Ciclo {detalle.anio} · {detalle.checklist.completos}/{detalle.checklist.total} requisitos</p>
              <ul className="prov-checklist">
                {detalle.checklist.items.map((it) => (
                  <li key={it.clave}>
                    <input
                      type="checkbox"
                      checked={it.cumple}
                      disabled={!canEdit || busy}
                      aria-label={it.label}
                      onChange={(e) => ejecutar(() => setDocumentoCicloApi(proveedorId, it.clave, e.target.checked))}
                    />
                    <span>{it.label}</span>
                    <span className="prov-check-tag">
                      {it.marcado ? "Marcado a mano" : it.auto ? (it.derivado ? "Automático" : "Pendiente") : "Se renueva cada ciclo"}
                    </span>
                  </li>
                ))}
              </ul>
              {detalle.ciclo.aprobadoPorNombre && (
                <p className="muted">Aprobado por {detalle.ciclo.aprobadoPorNombre}</p>
              )}
            </>
          )}
        </section>
      )}

      {tab === "historial" && (
        <section aria-label="Histórico por año">
          <ol className="prov-history">
            {detalle.ciclo && (
              <li><strong>{detalle.anio}</strong> · {detalle.ciclo.estadoLabel} <span className="muted">(vigente)</span></li>
            )}
            {detalle.historial.map((h) => (
              <li key={h.anio}>
                <strong>{h.anio}</strong> · {h.estadoLabel || h.clasificacionLabel}
                {h.aprobadoPorNombre ? <span className="muted"> · aprobó {h.aprobadoPorNombre}</span> : null}
              </li>
            ))}
            {!detalle.ciclo && detalle.historial.length === 0 && <li className="muted">Sin ciclos registrados.</li>}
          </ol>
        </section>
      )}

      {tab === "datos" && (
        <section aria-label="Datos del proveedor">
          <dl className="prov-kv">
            <dt>Clasificación</dt><dd>{detalle.clasificacionLabel}</dd>
            <dt>Criticidad</dt><dd>{detalle.criticidad || "Sin definir"}</dd>
            <dt>Área</dt><dd>{detalle.area || "—"}</dd>
            <dt>Servicio</dt><dd>{detalle.servicio || "—"}</dd>
            <dt>Teléfono</dt><dd className="mono">{detalle.telefono || "—"}</dd>
            <dt>Correo</dt><dd>{detalle.correo || "—"}</dd>
            <dt>Descripción</dt><dd>{detalle.descripcion}</dd>
            {detalle.esExcepcion && <><dt>Motivo de excepción</dt><dd>{detalle.motivoExcepcion}</dd></>}
            {detalle.esExcepcion && detalle.justificacionExcepcion && <><dt>Justificación</dt><dd>{detalle.justificacionExcepcion}</dd></>}
            {!detalle.activo && <><dt>Motivo de inactivo</dt><dd>{detalle.inactivoMotivo || "—"}</dd></>}
            <dt>Alta en el sistema</dt><dd className="mono">{new Date(detalle.createdAt).toLocaleDateString("es-CO")}</dd>
          </dl>
        </section>
      )}

      {editando && createPortal(
        <ProveedorFormModal
          proveedor={detalle}
          areas={areas}
          onClose={() => setEditando(false)}
          onSaved={() => { setEditando(false); cargar(proveedorId); onChanged?.(); }}
        />,
        document.body
      )}
      {accion && createPortal(
        <ProveedorAccionesModal
          proveedor={detalle}
          accion={accion}
          motivos={motivos}
          onClose={() => setAccion(null)}
          onDone={() => { setAccion(null); cargar(proveedorId); onChanged?.(); }}
        />,
        document.body
      )}
    </aside>
  );
}
