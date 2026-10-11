"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { createProveedorApi, updateProveedorApi, parseProveedorTextoApi, cambiarClasificacionApi, cambiarEstadoCicloApi } from "@/lib/api";
import { CLASIFICACIONES_MONTO, REVISIONES, ESTADOS_CICLO } from "@/lib/proveedoresOpciones";
import ProveedorAccionesModal from "@/components/proveedores/ProveedorAccionesModal";
import { IconSpark } from "@/components/icons";

// Crear o editar un proveedor. Al crear, se puede pegar el correo de solicitud
// y Nova precarga los campos: el usuario siempre revisa y confirma. Nunca se
// guarda nada automáticamente.
export default function ProveedorFormModal({ proveedor, areas = [], onClose, onSaved, onClasificado }) {
  const [inactivando, setInactivando] = useState(false);
  const [reactivando, setReactivando] = useState(false);
  const editando = !!proveedor;
  const [pasteOpen, setPasteOpen] = useState(!editando);
  const [texto, setTexto] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState("");

  const [nombre, setNombre] = useState(proveedor?.nombre || "");
  const [nit, setNit] = useState(proveedor?.nit || "");
  const [descripcion, setDescripcion] = useState(proveedor?.descripcion || "");
  const [telefono, setTelefono] = useState(proveedor?.telefono || "");
  const [correo, setCorreo] = useState(proveedor?.correo || "");
  const [areaId, setAreaId] = useState(proveedor?.areaId || "");
  const [servicio, setServicio] = useState(proveedor?.servicio || "");
  const [criticidad, setCriticidad] = useState(proveedor?.criticidad || "");
  const [clasificacionMonto, setClasificacionMonto] = useState(proveedor?.clasificacionMonto || "");
  const [revision, setRevision] = useState(proveedor?.revision || "");
  const [observacion, setObservacion] = useState(proveedor?.observacion || "");
  const estadoActual = proveedor?.ciclo?.estado || "";
  const [estado, setEstado] = useState(estadoActual);

  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleParse() {
    if (!texto.trim() || parsing) return;
    setParsing(true);
    setParseError("");
    try {
      const { campos } = await parseProveedorTextoApi(texto);
      if (campos.nombre) setNombre(campos.nombre);
      if (campos.nit) setNit(campos.nit);
      if (campos.telefono) setTelefono(campos.telefono);
      if (campos.correo) setCorreo(campos.correo);
      if (campos.servicio) setServicio(campos.servicio);
      if (campos.descripcion) setDescripcion(campos.descripcion);
      if (campos.criticidad) setCriticidad(campos.criticidad);
      setPasteOpen(false);
    } catch (err) {
      setParseError(err.message || "No se pudo interpretar el texto.");
    } finally {
      setParsing(false);
    }
  }

  // Reactivar un proveedor inactivo (inactivar pide el motivo en su propio diálogo).
  async function reactivar() {
    setReactivando(true);
    setError("");
    try {
      await cambiarClasificacionApi(proveedor.id, { accion: "reactivar" });
      onClasificado?.();
    } catch (err) {
      setError(err.message || "No se pudo reactivar el proveedor.");
    } finally {
      setReactivando(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!nombre.trim()) { setError("El nombre del proveedor es obligatorio."); return; }
    if (!descripcion.trim()) { setError("La descripción es obligatoria: qué vende o para qué sirve."); return; }

    const data = {
      nombre: nombre.trim(),
      nit: nit.trim() || (editando ? undefined : `PEND${Date.now()}`),
      descripcion: descripcion.trim(),
      telefono: telefono.trim() || null,
      correo: correo.trim() || null,
      areaId: areaId || null,
      servicio: servicio.trim() || null,
      criticidad: criticidad || null,
      clasificacionMonto: clasificacionMonto || null,
      revision: revision || null,
      observacion: observacion.trim() || null,
    };

    setSaving(true);
    try {
      const saved = editando ? await updateProveedorApi(proveedor.id, data) : await createProveedorApi(data);
      // El estado del ciclo se guarda aparte (valida el checklist completo para "Actualizado").
      if (editando && estadoActual && estado && estado !== estadoActual) await cambiarEstadoCicloApi(proveedor.id, estado);
      onSaved(saved);
    } catch (err) {
      setError(err.message || "No se pudo guardar el proveedor.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 560 }}>
        <div className="modal-head">
          <h3>{editando ? "Editar proveedor" : "Registrar proveedor"}</h3>
          <button type="button" className="btn-ghost icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>

        {pasteOpen && (
          <>
            <div className="modal-body" style={{ gridTemplateColumns: "1fr" }}>
              <div className="field">
                <label htmlFor="prov-pegar-texto"><IconSpark size={13} /> Pegar el correo de solicitud (opcional)</label>
                <textarea
                  id="prov-pegar-texto" rows={6}
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  placeholder="Pega aquí el texto del correo que pide registrar el proveedor — Nova completa los campos para que los revises."
                />
                {parseError && <div className="modal-error">{parseError}</div>}
              </div>
            </div>
            <div className="modal-foot">
              <button type="button" className="btn btn-primary" onClick={handleParse} disabled={!texto.trim() || parsing}>
                {parsing ? <span className="spinner" /> : <IconSpark size={13} />} {parsing ? "Leyendo…" : "Completar campos con Nova"}
              </button>
              <button type="button" className="btn" onClick={() => setPasteOpen(false)}>Llenar manualmente</button>
              <div className="spacer" />
              <button type="button" className="btn" onClick={onClose}>Cancelar</button>
            </div>
          </>
        )}

        {!pasteOpen && (
          <form onSubmit={handleSubmit}>
            <div className="modal-body" style={{ gridTemplateColumns: "1fr 1fr" }}>
              {editando && (
                <dl className="prov-kv prov-form-info" style={{ gridColumn: "1 / -1" }}>
                  {proveedor.fechaInvitacion && <><dt>Fecha invitación</dt><dd>{new Date(proveedor.fechaInvitacion).toLocaleDateString("es-CO")}</dd></>}
                  {proveedor.fechaActualizacion && <><dt>Fecha</dt><dd>{new Date(proveedor.fechaActualizacion).toLocaleDateString("es-CO")}</dd></>}
                  <dt>Auditoría</dt><dd>{proveedor.alerta && proveedor.alerta.nivel !== "ok" ? proveedor.alerta.titulo : "Sin alertas"}</dd>
                </dl>
              )}
              {!editando && (
                <div className="field" style={{ gridColumn: "1 / -1" }}>
                  <button type="button" className="btn small" onClick={() => setPasteOpen(true)} style={{ width: "fit-content" }}>
                    <IconSpark size={12} /> Pegar otro texto
                  </button>
                </div>
              )}
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label htmlFor="pf-nombre">Nombre del proveedor *</label>
                <input id="pf-nombre" required value={nombre} onChange={(e) => setNombre(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="pf-nit">NIT</label>
                <input id="pf-nit" value={nit} onChange={(e) => setNit(e.target.value)} placeholder="Si aún no lo tienes, se completa después" />
              </div>
              <div className="field">
                <label htmlFor="pf-criticidad">Criticidad</label>
                <select id="pf-criticidad" value={criticidad} onChange={(e) => setCriticidad(e.target.value)}>
                  <option value="">Sin definir</option>
                  <option value="Critico">Crítico</option>
                  <option value="No crítico">No crítico</option>
                </select>
              </div>
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label htmlFor="pf-descripcion">Descripción * <span className="muted">(qué vende o para qué sirve)</span></label>
                <input id="pf-descripcion" required value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="pf-area">Área</label>
                <select id="pf-area" value={areaId} onChange={(e) => setAreaId(e.target.value)}>
                  <option value="">Sin área</option>
                  {areas.map((a) => <option key={a.id} value={a.id}>{a.valor}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="pf-servicio">Tipo de servicio</label>
                <input id="pf-servicio" value={servicio} onChange={(e) => setServicio(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="pf-telefono">Contacto (teléfono)</label>
                <input id="pf-telefono" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
              </div>
              {editando && estadoActual && (
                <div className="field">
                  <label htmlFor="pf-estado">Estado</label>
                  <select id="pf-estado" value={estado} onChange={(e) => setEstado(e.target.value)}>
                    {ESTADOS_CICLO.map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}
                  </select>
                </div>
              )}
              <div className="field">
                <label htmlFor="pf-clasif">Clasificación por monto</label>
                <select id="pf-clasif" value={clasificacionMonto} onChange={(e) => setClasificacionMonto(e.target.value)}>
                  <option value="">Sin definir</option>
                  {CLASIFICACIONES_MONTO.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="pf-revision">Revisión</label>
                <select id="pf-revision" value={revision} onChange={(e) => setRevision(e.target.value)}>
                  <option value="">Sin definir</option>
                  {REVISIONES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="pf-correo">Correo de contacto</label>
                <input id="pf-correo" type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} />
              </div>
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label htmlFor="pf-obs">Observación</label>
                <textarea id="pf-obs" rows={3} value={observacion} onChange={(e) => setObservacion(e.target.value)} />
              </div>
              {editando && (
                <div className="prov-estado-box" style={{ gridColumn: "1 / -1" }}>
                  <div>
                    <strong>{proveedor.activo ? "Proveedor activo" : "Proveedor inactivo"}</strong>
                    <p className="muted" style={{ margin: "2px 0 0", fontSize: 13 }}>
                      {proveedor.activo ? "Si ya no trabaja con Sinco, inactívalo: no aparecerá al registrar compras y se conserva su histórico." : `Motivo: ${proveedor.inactivoMotivo || "—"}. Reactívalo para que vuelva a aparecer en compras.`}
                    </p>
                  </div>
                  {proveedor.activo ? (
                    <button type="button" className="btn small danger" onClick={() => setInactivando(true)}>Inactivar</button>
                  ) : (
                    <button type="button" className="btn small" onClick={reactivar} disabled={reactivando}>{reactivando ? <span className="spinner" /> : null} Reactivar</button>
                  )}
                </div>
              )}
              {error && <div className="modal-error" style={{ gridColumn: "1 / -1" }}>{error}</div>}
            </div>
            <div className="modal-foot">
              <div className="spacer" />
              <button type="button" className="btn" onClick={onClose}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? <span className="spinner" /> : null} {editando ? "Guardar cambios" : "Registrar"}
              </button>
            </div>
          </form>
        )}
      </div>
      {inactivando && createPortal(
        <ProveedorAccionesModal
          proveedor={proveedor}
          accion="inactivar"
          onClose={() => setInactivando(false)}
          onDone={() => { setInactivando(false); onClasificado?.(); }}
        />,
        document.body
      )}
    </div>
  );
}
