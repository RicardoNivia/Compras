"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { solicitudCorreoApi, aprobarSolicitudCorreoApi, descartarSolicitudCorreoApi, catalogosProveedorCliente } from "@/lib/correoApi";
import ProveedorFormModal from "@/components/proveedores/ProveedorFormModal";
import { Portal } from "@/components/notificaciones/ui";
import { IconMail, IconCheck, IconSpark } from "@/components/icons";

const ETIQUETA = { nit: "NIT", nombre: "Razón social", descripcion: "Descripción" };
const fecha = (iso) => (iso ? new Date(iso).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const nombreDe = (lista = [], id) => lista.find((m) => m.id === id)?.valor || null;

function Dato({ etiqueta, valor, falta }) {
  return (
    <div className={`sc-dato${falta ? " falta" : ""}`}>
      <span>{etiqueta}</span>
      {valor ? (
        <span className="desc-tooltip-wrap"><strong className="desc-text">{valor}</strong><span className="desc-tooltip-bubble">{valor}</span></span>
      ) : <strong className="sc-vacio">{falta ? "Falta" : "—"}</strong>}
    </div>
  );
}

// Solicitud de creación de proveedor que el agente de correo encontró (Bandeja y Mi correo). Si está completa se
// agrega con un clic; si falta algo (o la persona quiere revisarla) se abre el formulario con lo que falta en rojo.
export default function SolicitudProveedorCorreo({ id, onCambio }) {
  const [s, setS] = useState(null);
  const [catalogos, setCatalogos] = useState(null);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [formulario, setFormulario] = useState(null); // { aviso }
  const [descartando, setDescartando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [hecho, setHecho] = useState("");

  const cargar = useCallback(async () => {
    try {
      setS(await solicitudCorreoApi(id));
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }, [id]);

  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { catalogosProveedorCliente().then(setCatalogos).catch(() => setCatalogos({})); }, []);

  if (!s) return error ? <p className="modal-error">{error}</p> : <p className="muted"><span className="spinner" /> Cargando la solicitud…</p>;

  const d = s.datos || {};
  const faltan = new Set((s.faltantes || []).map((f) => f.campo));
  const yaExiste = (s.faltantes || []).find((f) => f.existe);
  const completa = !s.faltantes?.length;
  const cat = catalogos || {};

  const terminado = async (texto) => {
    setHecho(texto);
    await cargar();
    onCambio?.();
  };

  async function agregar() {
    setOcupado(true);
    setError("");
    try {
      const r = await aprobarSolicitudCorreoApi(s.id, {});
      await terminado(`Listo: ${r.proveedor.nombre} quedó registrado como proveedor.`);
    } catch (e) {
      // Algo cambió (p. ej. el NIT ya se registró): se abre el formulario con lo que falta.
      if (e.faltantes) {
        setS((x) => ({ ...x, faltantes: e.faltantes }));
        setFormulario({ aviso: e.error || e.message });
      } else setError(e.message);
    } finally {
      setOcupado(false);
    }
  }

  async function descartar() {
    setOcupado(true);
    setError("");
    try {
      await descartarSolicitudCorreoApi(s.id, motivo);
      setDescartando(false);
      await terminado("Solicitud descartada.");
    } catch (e) {
      setError(e.message);
    } finally {
      setOcupado(false);
    }
  }

  const avisoFaltantes = s.faltantes?.length
    ? `Nova leyó el correo de ${s.remitente || "la solicitud"}. Falta: ${s.faltantes.map((f) => `${ETIQUETA[f.campo]} — ${f.motivo}`).join(" · ")}`
    : `Nova leyó el correo de ${s.remitente || "la solicitud"}. Revisa los datos y regístralo.`;

  return (
    <div className="sc-solicitud">
      <div className="sc-cabeza">
        <IconMail size={16} />
        <div>
          {s.resumen && <p className="sc-resumen">{s.resumen}</p>}
          <small className="muted">De {s.remitente || "—"} · {fecha(s.recibidoAt)}{s.asunto ? <> · «{s.asunto}»</> : null}</small>
        </div>
        {s.webLink && <a className="btn small btn-ghost" href={s.webLink} target="_blank" rel="noopener noreferrer">Abrir en Outlook</a>}
      </div>

      <div className="sc-datos">
        <Dato etiqueta="NIT" valor={d.nit} falta={faltan.has("nit")} />
        <Dato etiqueta="Razón social" valor={d.nombre} falta={faltan.has("nombre")} />
        <Dato etiqueta="Descripción" valor={d.descripcion} falta={faltan.has("descripcion")} />
        <Dato etiqueta="Teléfono" valor={d.telefono} />
        <Dato etiqueta="Correo del proveedor" valor={d.correo} />
        <Dato etiqueta="Tipo de servicio" valor={nombreDe(cat.servicios, d.tipoServicioId)} />
        <Dato etiqueta="Criticidad" valor={nombreDe(cat.tipos, d.tipoProveedorId)} />
        <Dato etiqueta="Clasificación por monto" valor={nombreDe(cat.clasificaciones, d.clasificacionMontoId)} />
        <Dato etiqueta="Área" valor={nombreDe(cat.areas, d.areaId)} />
      </div>

      {s.estado === "pendiente" && s.faltantes?.length > 0 && (
        <ul className="sc-faltantes">
          {s.faltantes.map((f) => <li key={f.campo}><strong>{ETIQUETA[f.campo]}:</strong> {f.motivo}</li>)}
        </ul>
      )}
      {(s.notas?.length > 0 || s.adjuntos?.length > 0) && (
        <p className="prov-note">
          {s.adjuntos?.length > 0 && <>Adjuntos: {s.adjuntos.join(", ")}. </>}
          {s.notas?.join(" ")}
        </p>
      )}

      {s.estado === "aprobada" && (
        <p className="sc-estado"><span className="pill good"><IconCheck size={11} /> Agregado</span> {s.resueltoPorNombre ? `por ${s.resueltoPorNombre} ` : ""}el {fecha(s.resueltoAt)} · <Link href={`/proveedores?q=${encodeURIComponent(s.proveedorNit || "")}`}>Ver proveedor {s.proveedorNit}</Link></p>
      )}
      {s.estado === "descartada" && (
        <p className="sc-estado"><span className="pill muted">Descartada</span> {s.resueltoPorNombre ? `por ${s.resueltoPorNombre} ` : ""}el {fecha(s.resueltoAt)}{s.motivoDescarte ? ` · ${s.motivoDescarte}` : ""}</p>
      )}

      {s.estado === "pendiente" && !descartando && (
        <div className="sc-acciones">
          {yaExiste ? (
            <Link className="btn small" href={`/proveedores?q=${encodeURIComponent(d.nit || "")}`}>Ver el proveedor existente</Link>
          ) : completa ? (
            <>
              <button type="button" className="btn btn-primary small" onClick={agregar} disabled={ocupado}>
                {ocupado ? <span className="spinner" /> : <IconCheck size={12} />} Agregar proveedor
              </button>
              <button type="button" className="btn small" onClick={() => setFormulario({ aviso: avisoFaltantes })} disabled={ocupado || !catalogos}>Revisar antes de agregar</button>
            </>
          ) : (
            <button type="button" className="btn btn-primary small" onClick={() => setFormulario({ aviso: avisoFaltantes })} disabled={ocupado || !catalogos}>
              <IconSpark size={12} /> Completar y agregar
            </button>
          )}
          <button type="button" className="btn small btn-ghost" onClick={() => setDescartando(true)} disabled={ocupado}>Descartar</button>
        </div>
      )}

      {descartando && (
        <div className="sc-descartar">
          <div className="field">
            <label htmlFor={`sc-motivo-${s.id}`}>¿Por qué la descartas? (opcional)</label>
            <input id={`sc-motivo-${s.id}`} value={motivo} maxLength={300} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. ya se registró con otro NIT, no es un proveedor nuevo…" />
          </div>
          <div className="sc-acciones">
            <button type="button" className="btn small btn-danger-text" onClick={descartar} disabled={ocupado}>{ocupado ? <span className="spinner" /> : null} Descartar solicitud</button>
            <button type="button" className="btn small" onClick={() => setDescartando(false)} disabled={ocupado}>Cancelar</button>
          </div>
        </div>
      )}

      {error && <p className="modal-error">{error}</p>}
      {hecho && <p className="sc-hecho" role="status">{hecho}</p>}

      {formulario && (
        <Portal>
          <ProveedorFormModal
            catalogos={catalogos || {}}
            inicial={d}
            titulo="Registrar proveedor desde el correo"
            aviso={formulario.aviso}
            guardar={async (datos) => (await aprobarSolicitudCorreoApi(s.id, datos)).proveedor}
            onClose={() => setFormulario(null)}
            onSaved={async (p) => { setFormulario(null); await terminado(`Listo: ${p.nombre} quedó registrado como proveedor.`); }}
          />
        </Portal>
      )}
    </div>
  );
}
