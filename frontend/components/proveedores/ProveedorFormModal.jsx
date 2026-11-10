"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createProveedorApi, updateProveedorApi, parseProveedorTextoApi, cambiarClasificacionApi, cambiarEstadoCicloApi, verificarNitApi } from "@/lib/api";
import { REVISIONES, ESTADOS_CICLO, maestroPorTexto, normalizeNit, nitValido, diaISO, fmtFecha } from "@/lib/proveedoresOpciones";
import ProveedorAccionesModal from "@/components/proveedores/ProveedorAccionesModal";
import { IconSpark } from "@/components/icons";

// Campos obligatorios del formulario (en el orden en que aparecen).
const CAMPOS_OBLIGATORIOS = {
  nit: { id: "pf-nit", label: "NIT" },
  nombre: { id: "pf-nombre", label: "Razón social" },
  descripcion: { id: "pf-descripcion", label: "Descripción" },
  motivo: { id: "pf-motivo", label: "Motivo de excepción" },
};
const ORDEN_OBLIGATORIOS = Object.keys(CAMPOS_OBLIGATORIOS);

function CampoObligatorio({ visible }) {
  return visible ? <span className="campo-error" role="alert">Campo obligatorio</span> : null;
}

// Opciones de un maestro: las activas, más el valor actual aunque esté inactivo.
function opciones(lista, actualId) {
  return lista.filter((m) => m.activo !== false || m.id === actualId);
}

// Crear o editar un proveedor. El NIT es la llave primaria: se valida en tiempo real
// contra el catálogo y no se puede guardar si ya existe (al crear o al cambiarlo).
// Tipo, clasificación por monto, tipo de servicio, área y motivo de excepción son maestros.
// Al crear, se puede pegar el correo de solicitud y Nova precarga los campos.
export default function ProveedorFormModal({ proveedor, catalogos = {}, inicioCiclo: inicioCicloProp, onClose, onSaved, onClasificado, inicial = null, guardar = null, titulo = null, aviso = null }) {
  const { areas = [], tipos = [], clasificaciones = [], servicios = [], motivos = [] } = catalogos;
  const [inactivando, setInactivando] = useState(false);
  const [reactivando, setReactivando] = useState(false);
  const editando = !!proveedor;
  // inicial: datos para precargar un proveedor NUEVO (p. ej. los que sacó el agente de correo); guardar: reemplaza
  // la creación (la solicitud del correo se aprueba en su propia ruta); aviso: texto arriba del formulario.
  const valores = proveedor || inicial;
  // Por defecto se muestra el llenado manual; "Pegar el correo de solicitud" abre la opción con Nova.
  const [pasteOpen, setPasteOpen] = useState(false);
  const [texto, setTexto] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState("");
  const [novaNota, setNovaNota] = useState("");

  const [nombre, setNombre] = useState(valores?.nombre || "");
  const [nit, setNit] = useState(valores?.nit || "");
  const [descripcion, setDescripcion] = useState(valores?.descripcion || "");
  const [telefono, setTelefono] = useState(valores?.telefono || "");
  const [correo, setCorreo] = useState(valores?.correo || "");
  const [areaId, setAreaId] = useState(valores?.areaId || "");
  const [tipoServicioId, setTipoServicioId] = useState(valores?.tipoServicioId || "");
  const [tipoProveedorId, setTipoProveedorId] = useState(valores?.tipoProveedorId || "");
  const [clasificacionMontoId, setClasificacionMontoId] = useState(valores?.clasificacionMontoId || "");
  const [revision, setRevision] = useState(valores?.revision || "");
  const [observacion, setObservacion] = useState(valores?.observacion || "");
  const [esExcepcion, setEsExcepcion] = useState(!!valores?.esExcepcion);
  const [motivoExcepcionId, setMotivoExcepcionId] = useState(valores?.motivoExcepcionId || "");
  const [justificacion, setJustificacion] = useState(valores?.justificacionExcepcion || "");
  const estadoActual = proveedor?.ciclo?.estado || "";
  const [estado, setEstado] = useState(estadoActual);
  // Al aprobar (pasar a Actualizado) se pide la fecha de actualización: del ciclo vigente y no futura.
  const aprobando = estado === "actualizado" && estado !== estadoActual;
  const [fechaActualizacion, setFechaActualizacion] = useState(() => diaISO());
  const inicioCiclo = proveedor?.inicioCiclo || inicioCicloProp;
  const hoy = diaISO();
  const minFecha = inicioCiclo ? diaISO(inicioCiclo) : undefined;

  // Validación del NIT en tiempo real: { estado: "vacio"|"invalido"|"verificando"|"libre"|"existe"|"error", proveedor }
  const [nitCheck, setNitCheck] = useState({ estado: editando ? "libre" : "vacio" });
  const consulta = useRef(0);
  const nitOriginal = proveedor?.nit || "";
  const nitNormalizado = normalizeNit(nit);
  const nitSinCambio = editando && nitNormalizado === nitOriginal;

  useEffect(() => {
    if (nitSinCambio) { setNitCheck({ estado: "libre" }); return undefined; }
    if (!nitNormalizado) { setNitCheck({ estado: "vacio" }); return undefined; }
    if (!nitValido(nitNormalizado)) { setNitCheck({ estado: "invalido" }); return undefined; }
    setNitCheck({ estado: "verificando" });
    const n = ++consulta.current;
    const t = setTimeout(async () => {
      try {
        const res = await verificarNitApi(nitNormalizado, nitOriginal || undefined);
        if (n !== consulta.current) return;
        setNitCheck(res.existe ? { estado: "existe", proveedor: res.proveedor } : { estado: "libre" });
      } catch {
        if (n === consulta.current) setNitCheck({ estado: "error" });
      }
    }, 350);
    return () => clearTimeout(t);
  }, [nitNormalizado, nitSinCambio, nitOriginal]);


  // Validación al intentar guardar: los obligatorios que falten se resaltan en rojo.
  const [intentado, setIntentado] = useState(!!inicial); // con datos precargados, lo que falta se ve en rojo de una vez
  const faltantes = {
    nit: ["vacio", "invalido", "existe"].includes(nitCheck.estado),
    nombre: !nombre.trim(),
    descripcion: !descripcion.trim(),
    motivo: esExcepcion && !motivoExcepcionId,
  };
  const marcar = (campo) => intentado && faltantes[campo];
  const claseCampo = (campo, extra = "") => `field${extra ? ` ${extra}` : ""}${marcar(campo) ? " faltante" : ""}`;

  async function handleParse() {
    if (!texto.trim() || parsing) return;
    setParsing(true);
    setParseError("");
    try {
      const { campos } = await parseProveedorTextoApi(texto);
      const notas = [];
      if (campos.nombre) setNombre(campos.nombre);
      if (campos.nit) setNit(normalizeNit(campos.nit));
      if (campos.telefono) setTelefono(campos.telefono);
      if (campos.correo) setCorreo(campos.correo);
      if (campos.descripcion) setDescripcion(campos.descripcion);
      if (campos.criticidad) {
        const t = maestroPorTexto(tipos, campos.criticidad) || tipos.find((m) => /no/i.test(m.valor) === /no/i.test(campos.criticidad));
        if (t) setTipoProveedorId(t.id);
      }
      if (campos.servicio) {
        const sv = maestroPorTexto(servicios, campos.servicio);
        if (sv) setTipoServicioId(sv.id);
        else notas.push(`Nova sugirió el tipo de servicio «${campos.servicio}», que no existe en Maestros: elige uno de la lista o créalo en Maestros › Tipo de servicio.`);
      }
      setNovaNota(notas.join(" "));
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
      await cambiarClasificacionApi(proveedor.nit, { accion: "reactivar" });
      onClasificado?.();
    } catch (err) {
      setError(err.message || "No se pudo reactivar el proveedor.");
    } finally {
      setReactivando(false);
    }
  }

  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setIntentado(true);
    // Campos obligatorios: se marcan en rojo y se lleva el foco al primero que falte.
    const primero = ORDEN_OBLIGATORIOS.find((c) => faltantes[c]);
    if (primero) {
      const nombres = ORDEN_OBLIGATORIOS.filter((c) => faltantes[c]).map((c) => CAMPOS_OBLIGATORIOS[c].label);
      setError(nitCheck.estado === "existe"
        ? `Ya existe un proveedor con el NIT ${nitNormalizado}: ${nitCheck.proveedor?.nombre}.`
        : `Completa los campos marcados en rojo: ${nombres.join(", ")}.`);
      const el = document.getElementById(CAMPOS_OBLIGATORIOS[primero].id);
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
      el?.focus({ preventScroll: true });
      return;
    }
    if (nitCheck.estado === "verificando") { setError("Espera un momento: se está verificando el NIT."); return; }
    if (aprobando && !esExcepcion) {
      const motivo = !fechaActualizacion ? "Indica la fecha de actualización."
        : fechaActualizacion > hoy ? "La fecha de actualización no puede ser futura."
        : minFecha && fechaActualizacion < minFecha ? `La fecha de actualización debe ser del ciclo vigente (desde el ${fmtFecha(inicioCiclo)}).` : "";
      if (motivo) {
        setError(motivo);
        document.getElementById("pf-fecha-act")?.focus();
        return;
      }
    }

    const data = {
      nombre: nombre.trim(),
      nit: nitNormalizado,
      descripcion: descripcion.trim(),
      telefono: telefono.trim() || null,
      correo: correo.trim() || null,
      areaId: areaId || null,
      tipoServicioId: tipoServicioId || null,
      tipoProveedorId: tipoProveedorId || null,
      clasificacionMontoId: clasificacionMontoId || null,
      revision: revision || null,
      observacion: observacion.trim() || null,
      esExcepcion,
      motivoExcepcionId: esExcepcion ? motivoExcepcionId : null,
      justificacionExcepcion: esExcepcion ? justificacion.trim() || null : null,
    };

    setSaving(true);
    try {
      const saved = editando ? await updateProveedorApi(proveedor.nit, data) : guardar ? await guardar(data) : await createProveedorApi(data);
      // El estado del ciclo se guarda aparte (valida el checklist completo para "Actualizado").
      if (editando && !esExcepcion && estadoActual && estado && estado !== estadoActual) await cambiarEstadoCicloApi(saved.nit, estado, aprobando ? fechaActualizacion : undefined);
      onSaved(saved);
    } catch (err) {
      setError(err.message || "No se pudo guardar el proveedor.");
    } finally {
      setSaving(false);
    }
  }

  const nitAyuda = {
    vacio: { cls: intentado ? "bad" : "muted", txt: "Obligatorio. Es la llave del proveedor, sin dígito de verificación (si lo escribes con -DV, se quita solo)." },
    invalido: { cls: "bad", txt: "NIT inválido: solo el número, sin dígito de verificación (5 a 20 caracteres; se aceptan NIT extranjeros)." },
    verificando: { cls: "muted", txt: "Verificando si el NIT ya existe…" },
    libre: { cls: "good", txt: nitSinCambio ? "NIT actual del proveedor." : "✓ NIT disponible: no está registrado." },
    existe: { cls: "bad", txt: `✕ Este NIT ya está registrado: ${nitCheck.proveedor?.nombre || ""}${nitCheck.proveedor && !nitCheck.proveedor.activo ? " (inactivo)" : ""}. No se puede registrar de nuevo.` },
    error: { cls: "bad", txt: "No se pudo verificar el NIT. Se validará al guardar." },
  }[nitCheck.estado];

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal prov-form-modal" style={{ maxWidth: 680 }}>
        <div className="modal-head">
          <h3>{titulo || (editando ? "Editar proveedor" : "Registrar proveedor")}</h3>
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
          <form onSubmit={handleSubmit} noValidate>
            <div className="modal-body prov-form">
              {editando && (
                <div className="prov-form-resumen">
                  <div><span>Registrado</span><strong>{proveedor.createdAt ? new Date(proveedor.createdAt).toLocaleDateString("es-CO") : "—"}</strong></div>
                  <div><span>Última actualización</span><strong>{proveedor.esExcepcion ? "No aplica" : proveedor.fechaActualizacion ? new Date(proveedor.fechaActualizacion).toLocaleDateString("es-CO") : "Sin registrar"}</strong></div>
                  {proveedor.fechaInvitacion && <div><span>Invitación</span><strong>{new Date(proveedor.fechaInvitacion).toLocaleDateString("es-CO")}</strong></div>}
                  <div><span>Alerta</span><strong>{proveedor.alerta && proveedor.alerta.nivel !== "ok" ? proveedor.alerta.titulo : "Sin alertas"}</strong></div>
                </div>
              )}
              {!editando && !inicial && (
                <button type="button" className="btn small" onClick={() => setPasteOpen(true)} style={{ width: "fit-content" }}>
                  <IconSpark size={12} /> Pegar el correo de solicitud y completar con Nova
                </button>
              )}
              {aviso && <p className="prov-note">{aviso}</p>}
              {novaNota && <p className="prov-note">{novaNota}</p>}

              <fieldset className="prov-form-section">
                <legend>Identificación</legend>
                <div className="prov-form-grid">
                  <div className={claseCampo("nit")}>
                    <label htmlFor="pf-nit">NIT *</label>
                    <input
                      id="pf-nit" required autoComplete="off" autoFocus={!editando}
                      value={nit}
                      onChange={(e) => setNit(e.target.value)}
                      aria-invalid={nitCheck.estado === "existe" || nitCheck.estado === "invalido" || marcar("nit")}
                      aria-describedby="pf-nit-ayuda"
                      placeholder="Sin dígito de verificación"
                      className="mono"
                    />
                    <span id="pf-nit-ayuda" className={`prov-nit-ayuda ${nitAyuda.cls}`} role="status" aria-live="polite">{nitAyuda.txt}</span>
                  </div>
                  <div className={claseCampo("nombre")}>
                    <label htmlFor="pf-nombre">Razón social *</label>
                    <input id="pf-nombre" required value={nombre} onChange={(e) => setNombre(e.target.value)} aria-invalid={marcar("nombre")} />
                    <CampoObligatorio visible={marcar("nombre")} />
                  </div>
                  <div className={claseCampo("descripcion", "span-2")}>
                    <label htmlFor="pf-descripcion">Descripción * <span className="prov-form-hint">qué vende o para qué sirve</span></label>
                    <input id="pf-descripcion" required value={descripcion} onChange={(e) => setDescripcion(e.target.value)} aria-invalid={marcar("descripcion")} />
                    <CampoObligatorio visible={marcar("descripcion")} />
                  </div>
                </div>
              </fieldset>

              <fieldset className="prov-form-section">
                <legend>Clasificación</legend>
                <div className="prov-form-grid">
                  <div className="field">
                    <label htmlFor="pf-tipo">Tipo (criticidad)</label>
                    <select id="pf-tipo" value={tipoProveedorId} onChange={(e) => setTipoProveedorId(e.target.value)}>
                      <option value="">Sin definir</option>
                      {opciones(tipos, proveedor?.tipoProveedorId).map((m) => <option key={m.id} value={m.id}>{m.valor}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="pf-clasif">Clasificación por monto</label>
                    <select id="pf-clasif" value={clasificacionMontoId} onChange={(e) => setClasificacionMontoId(e.target.value)}>
                      <option value="">Sin definir</option>
                      {opciones(clasificaciones, proveedor?.clasificacionMontoId).map((m) => <option key={m.id} value={m.id}>{m.valor}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="pf-area">Área</label>
                    <select id="pf-area" value={areaId} onChange={(e) => setAreaId(e.target.value)}>
                      <option value="">Sin área</option>
                      {opciones(areas, proveedor?.areaId).map((a) => <option key={a.id} value={a.id}>{a.valor}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="pf-servicio">Tipo de servicio</label>
                    <select id="pf-servicio" value={tipoServicioId} onChange={(e) => setTipoServicioId(e.target.value)}>
                      <option value="">Sin definir</option>
                      {opciones(servicios, proveedor?.tipoServicioId).map((m) => <option key={m.id} value={m.id}>{m.valor}</option>)}
                    </select>
                  </div>
                </div>
                <p className="prov-form-hint">Las opciones se administran en Maestros › Proveedores.</p>
              </fieldset>

              <fieldset className="prov-form-section">
                <legend>Contacto</legend>
                <div className="prov-form-grid">
                  <div className="field">
                    <label htmlFor="pf-telefono">Teléfono</label>
                    <input id="pf-telefono" inputMode="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor="pf-correo">Correo</label>
                    <input id="pf-correo" type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} />
                  </div>
                </div>
              </fieldset>

              <fieldset className="prov-form-section">
                <legend>Gestión y ciclo</legend>
                <div className="prov-form-grid">
                  <div className="field">
                    <label htmlFor="pf-revision">Revisión</label>
                    <select id="pf-revision" value={revision} onChange={(e) => setRevision(e.target.value)}>
                      <option value="">Sin definir</option>
                      {REVISIONES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                  {editando && estadoActual && !esExcepcion ? (
                    <div className="field">
                      <label htmlFor="pf-estado">Estado en el ciclo</label>
                      <select id="pf-estado" value={estado} onChange={(e) => setEstado(e.target.value)}>
                        {ESTADOS_CICLO.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                      </select>
                    </div>
                  ) : <div />}
                  {editando && estadoActual && !esExcepcion && aprobando && (
                    <div className="field">
                      <label htmlFor="pf-fecha-act">Fecha de actualización *</label>
                      <input id="pf-fecha-act" type="date" value={fechaActualizacion} min={minFecha} max={hoy} required onChange={(e) => setFechaActualizacion(e.target.value)} />
                      <span className="prov-form-hint">Queda como fecha de última actualización del proveedor (base del ciclo).</span>
                    </div>
                  )}
                  <div className="field span-2">
                    <label htmlFor="pf-obs">Observación</label>
                    <textarea id="pf-obs" rows={2} value={observacion} onChange={(e) => setObservacion(e.target.value)} />
                  </div>
                </div>

                <div className={`prov-excepcion-card${esExcepcion ? " on" : ""}`}>
                  <label className="prov-toggle-row" style={{ margin: 0 }}>
                    <input type="checkbox" role="switch" className="prov-switch" checked={esExcepcion} onChange={(e) => setEsExcepcion(e.target.checked)} />
                    <span>
                      <strong>Marcar como excepción</strong>
                      <span className="prov-form-hint">No participa en el ciclo de actualización ni depende de fechas de registro o actualización.</span>
                    </span>
                  </label>
                  {esExcepcion && (
                    <div className="prov-form-grid">
                      <div className={claseCampo("motivo")}>
                        <label htmlFor="pf-motivo">Motivo *</label>
                        <select id="pf-motivo" value={motivoExcepcionId} onChange={(e) => setMotivoExcepcionId(e.target.value)} required aria-invalid={marcar("motivo")}>
                          <option value="">Elige un motivo</option>
                          {opciones(motivos, proveedor?.motivoExcepcionId).map((m) => <option key={m.id} value={m.id}>{m.valor}</option>)}
                        </select>
                        <CampoObligatorio visible={marcar("motivo")} />
                      </div>
                      <div className="field">
                        <label htmlFor="pf-justif">Justificación</label>
                        <input id="pf-justif" value={justificacion} onChange={(e) => setJustificacion(e.target.value)} />
                      </div>
                    </div>
                  )}
                </div>
              </fieldset>

              {editando && (
                <div className="prov-estado-box">
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
              {error && <div className="modal-error" role="alert">{error}</div>}
            </div>
            <div className="modal-foot">
              {nitCheck.estado === "existe" && <span className="prov-nit-ayuda bad" style={{ margin: 0 }}>NIT duplicado: no se puede guardar.</span>}
              <div className="spacer" />
              <button type="button" className="btn" onClick={onClose}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={saving || nitCheck.estado === "existe" || nitCheck.estado === "verificando"} title={nitCheck.estado === "existe" ? "Este NIT ya está registrado" : undefined}>
                {saving ? <span className="spinner" /> : null} {editando ? "Guardar cambios" : "Registrar proveedor"}
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
