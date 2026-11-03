"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  fetchProveedorDetalle, setDocumentoCicloApi,
} from "@/lib/api";
import ProveedorFormModal from "@/components/proveedores/ProveedorFormModal";
import ComprasProveedor from "@/components/proveedores/ComprasProveedor";
import ValoracionPuntaje from "@/components/ValoracionPuntaje";
import { crossfade } from "@/lib/crossfade";

const TABS = [
  { key: "checklist", label: "Checklist" },
  { key: "compras", label: "Compras y calificaciones" },
  { key: "historial", label: "Histórico por año" },
  { key: "datos", label: "Datos" },
];

// Ficha del proveedor dentro del maestro: estado del ciclo, checklist,
// el histórico anual (solo consulta: los estados se cambian desde la tabla y la
// excepción desde el formulario de edición). Todo cambio pasa por la API.
// El proveedor se identifica por su NIT (llave primaria); si se corrige el NIT
// al editar, la ficha sigue al NIT nuevo.
export default function ProveedorDetalle({ proveedorNit, catalogos = {}, canEdit, onChanged }) {
  const [nitActual, setNitActual] = useState(proveedorNit);
  useEffect(() => { setNitActual(proveedorNit); }, [proveedorNit]);
  const [detalle, setDetalle] = useState(null);
  const [tab, setTab] = useState("checklist");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editando, setEditando] = useState(false);

  async function cargar(id) {
    try {
      setDetalle(await fetchProveedorDetalle(id));
      setError("");
    } catch (err) {
      setError(err.message || "No se pudo cargar el proveedor.");
    }
  }

  useEffect(() => {
    if (nitActual) cargar(nitActual);
    else setDetalle(null);
  }, [nitActual]);

  async function ejecutar(fn) {
    setBusy(true);
    setError("");
    try {
      await fn();
      await cargar(nitActual);
      onChanged?.();
    } catch (err) {
      setError(err.message || "No se pudo guardar el cambio.");
    } finally {
      setBusy(false);
    }
  }

  if (!nitActual) {
    return (
      <aside className="prov-detail prov-detail-empty" aria-label="Detalle del proveedor">
        <p className="muted">Elige un proveedor de la lista para ver su checklist y su histórico.</p>
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

      <div role="tablist" aria-label="Secciones del proveedor" className="prov-tabs">
        {TABS.map((t) => (
          <button key={t.key} role="tab" type="button" aria-selected={tab === t.key} className="prov-tab" onClick={() => crossfade(() => setTab(t.key))}>
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
                      onChange={(e) => ejecutar(() => setDocumentoCicloApi(nitActual, it.clave, e.target.checked))}
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

      {tab === "compras" && <ComprasProveedor nit={nitActual} />}

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
            <dt>NIT</dt><dd className="mono">{detalle.nit}</dd>
            <dt>Calificación general (Nova)</dt>
            <dd>{detalle.valoracionIA ? <><ValoracionPuntaje puntaje={detalle.valoracionIA.promedio} decimales /> <span className="muted">en {detalle.valoracionIA.cantidad} compra(s) valoradas</span></> : "Sin valorar"}</dd>
            <dt>Clasificación</dt><dd>{detalle.clasificacionLabel}</dd>
            <dt>Tipo (criticidad)</dt><dd>{detalle.criticidad || "Sin definir"}</dd>
            <dt>Clasificación por monto</dt><dd>{detalle.clasificacionMonto || "—"}</dd>
            <dt>Área</dt><dd>{detalle.area || "—"}</dd>
            <dt>Tipo de servicio</dt><dd>{detalle.servicio || "—"}</dd>
            <dt>Excepción</dt><dd>{detalle.esExcepcion ? "Sí — no participa en el ciclo" : "No"}</dd>
            <dt>Última actualización</dt><dd className="mono">{detalle.esExcepcion ? "No aplica" : detalle.fechaActualizacion ? new Date(detalle.fechaActualizacion).toLocaleDateString("es-CO") : "Sin registrar"}</dd>
            <dt>Teléfono</dt><dd className="mono">{detalle.telefono || "—"}</dd>
            <dt>Correo</dt><dd>{detalle.correo || "—"}</dd>
            <dt>Descripción</dt><dd>{detalle.descripcion}</dd>
            {detalle.esExcepcion && <><dt>Motivo de excepción</dt><dd>{detalle.motivoExcepcion}</dd></>}
            {detalle.esExcepcion && detalle.justificacionExcepcion && <><dt>Justificación</dt><dd>{detalle.justificacionExcepcion}</dd></>}
            {!detalle.activo && <><dt>Motivo de inactivo</dt><dd>{detalle.inactivoMotivo || "—"}</dd></>}
            <dt>Fecha de registro</dt><dd className="mono">{new Date(detalle.createdAt).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })}</dd>
            <dt>Registrado por</dt><dd>{detalle.creadoPorNombre || "—"}</dd>
          </dl>
        </section>
      )}

      {editando && createPortal(
        <ProveedorFormModal
          proveedor={detalle}
          catalogos={catalogos}
          onClose={() => setEditando(false)}
          onSaved={(saved) => { setEditando(false); setNitActual(saved.nit); cargar(saved.nit); onChanged?.(); }}
        />,
        document.body
      )}
    </aside>
  );
}
