"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { fetchAsociadorApi, accionAsociadorApi, revisionDiariaAsociadorApi } from "@/lib/api";
import { fmtCOP } from "@/lib/format";
import { crossfade } from "@/lib/crossfade";
import PiePagina, { usePagina } from "@/components/bienestar/PiePagina";
import { IconSpark } from "@/components/icons";

const ESTADOS = [
  ["pendiente", "Por revisar"],
  ["aceptada", "Asociadas"],
  ["descartada", "Descartadas"],
  ["sin_coincidencia", "Sin actividad"],
];
const CONFIANZA = { alta: "Alta", media: "Media", baja: "Baja" };

function Celda({ texto, ancho = 260 }) {
  if (!texto) return <span className="muted">—</span>;
  return (
    <span className="desc-tooltip-wrap" style={{ maxWidth: ancho }}>
      <span className="desc-text">{texto}</span>
      <span className="desc-tooltip-bubble">{texto}</span>
    </span>
  );
}

// Agente asociador: Nova propone a qué actividad pertenece cada compra del área Bienestar sin actividad. Nada se asocia
// sin confirmar; aceptar pasa por el mismo camino que asociar a mano y queda en la auditoría de la compra.
export default function AgenteAsociador() {
  const [datos, setDatos] = useState(null);
  const [estado, setEstado] = useState("pendiente");
  const [confianza, setConfianza] = useState("");
  const [buscar, setBuscar] = useState("");
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [trabajando, setTrabajando] = useState(null); // id o "lote"
  const [confirmarLote, setConfirmarLote] = useState(false);
  const sondeo = useRef(null);

  const cargar = useCallback(async () => {
    try {
      const r = await fetchAsociadorApi();
      setDatos(r);
      return r;
    } catch (e) {
      setError(e.message);
      return null;
    }
  }, []);

  // Mientras Nova revisa, se consulta cada 3 s hasta que termine.
  const seguir = useCallback(() => {
    clearTimeout(sondeo.current);
    sondeo.current = setTimeout(async () => {
      const r = await cargar();
      if (r?.estado?.corriendo) seguir();
      else if (r?.estado?.ultima) setAviso(`Nova revisó ${r.estado.ultima.revisadas} compra(s): ${r.estado.ultima.propuestas} con actividad propuesta y ${r.estado.ultima.sinCoincidencia} sin actividad que encaje.`);
    }, 3000);
  }, [cargar]);

  useEffect(() => {
    cargar().then((r) => { if (r?.estado?.corriendo) seguir(); });
    return () => clearTimeout(sondeo.current);
  }, [cargar, seguir]);

  async function iniciarBusqueda() {
    setError("");
    setAviso("");
    try {
      await accionAsociadorApi("buscar");
      setDatos((d) => (d ? { ...d, estado: { ...d.estado, corriendo: true } } : d));
      seguir();
    } catch (e) {
      setError(e.message);
    }
  }

  // Encender o apagar la revisión diaria automática (apagada por defecto: solo así avisa en la Bandeja).
  async function cambiarRevisionDiaria(activo) {
    setError("");
    setAviso("");
    try {
      const { revisionDiaria } = await revisionDiariaAsociadorApi(activo);
      setDatos((d) => (d ? { ...d, revisionDiaria } : d));
      setAviso(activo ? "Revisión diaria encendida: Nova revisará sola una vez al día y avisará en la Bandeja cuando encuentre propuestas." : "Revisión diaria apagada: Nova solo revisa cuando uses «Buscar ahora».");
    } catch (e) {
      setError(e.message);
    }
  }

  async function resolver(ids, accion, clave) {
    setError("");
    setAviso("");
    setTrabajando(clave);
    try {
      const r = await accionAsociadorApi(accion, ids);
      setAviso(accion === "aceptar"
        ? `${r.hechas} compra(s) asociadas a su actividad.${r.errores.length ? ` ${r.errores.length} no se pudieron: ${r.errores[0].error}` : ""}`
        : `${r.hechas} propuesta(s) descartadas.`);
      await cargar();
    } catch (e) {
      setError(e.message);
    } finally {
      setTrabajando(null);
      setConfirmarLote(false);
    }
  }

  const propuestas = datos?.propuestas || [];
  const pendientes = propuestas.filter((p) => p.estado === "pendiente");
  const altas = pendientes.filter((p) => p.confianza === "alta");
  const q = buscar.trim().toLowerCase();
  const filas = useMemo(() => propuestas
    .filter((p) => (estado === "aceptada" ? p.estado === "aceptada" || p.estado === "resuelta" : p.estado === estado))
    .filter((p) => !confianza || p.confianza === confianza)
    .filter((p) => !q || `${p.compra.numero} ${p.compra.descripcion} ${p.compra.proveedor} ${p.actividad?.nombre}`.toLowerCase().includes(q)), [propuestas, estado, confianza, q]);
  const pag = usePagina(filas, `${estado}|${confianza}|${q}`);
  const corriendo = datos?.estado?.corriendo;

  return (
    <div className="agente-panel">
      <section className="agente-cabeza">
        <div className="agente-cabeza-texto">
          <h2><IconSpark size={18} /> Asociar compras a su actividad</h2>
          <p>Nova revisa las compras del área Bienestar que no tienen actividad y propone a cuál pertenecen, comparando la descripción, la fecha, el proveedor y la categoría con las actividades cercanas. Tú confirmas o descartas: nada se asocia solo. Con «Buscar ahora» revisa al momento y ves el resultado aquí; si enciendes la revisión diaria, revisa sola una vez al día y te avisa en la Bandeja.</p>
        </div>
        <div className="agente-cabeza-acciones">
          <button type="button" className="btn btn-primary" onClick={iniciarBusqueda} disabled={!datos || corriendo}>
            {corriendo ? <><span className="spinner" /> Nova está revisando…</> : <><IconSpark size={14} /> Buscar ahora</>}
          </button>
          <label className="agente-interruptor" title={datos?.revisionDiaria?.actualizadoPorNombre ? `Último cambio: ${datos.revisionDiaria.actualizadoPorNombre}` : undefined}>
            <span>Revisión diaria automática</span>
            <span className="toggle-switch">
              <input type="checkbox" checked={!!datos?.revisionDiaria?.activo} disabled={!datos} onChange={(e) => cambiarRevisionDiaria(e.target.checked)} />
              <span className="toggle-track"><span className="toggle-thumb" /></span>
            </span>
          </label>
        </div>
      </section>

      <section className="agente-cifras" aria-label="Resumen">
        <div><span>Por revisar</span><strong>{pendientes.length}</strong><small>{fmtCOP(pendientes.reduce((s, p) => s + (p.compra.valor || 0), 0))} en compras</small></div>
        <div className="destaca"><span>Confianza alta</span><strong>{altas.length}</strong><small>La compra nombra la actividad</small></div>
        <div><span>Sin actividad que encaje</span><strong>{propuestas.filter((p) => p.estado === "sin_coincidencia").length}</strong><small>Compras generales del área</small></div>
        <div><span>Última revisión</span><strong className="pequeno">{datos?.estado?.ultima ? new Date(datos.estado.ultima.at).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" }) : "—"}</strong><small>{datos?.estado?.ultima ? `${datos.estado.ultima.revisadas} compra(s) revisadas` : "Aún no ha revisado desde que arrancó el servidor"}</small></div>
      </section>

      {aviso && <div className="ficha-aviso" role="status">{aviso}</div>}
      {error && <div className="modal-error">{error}</div>}

      <div className="agente-filtros">
        <div className="dash-tabs" role="tablist" aria-label="Estado">
          {ESTADOS.map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={estado === k} className="dash-tab" onClick={() => crossfade(() => setEstado(k))}>
              {l} ({propuestas.filter((p) => (k === "aceptada" ? p.estado === "aceptada" || p.estado === "resuelta" : p.estado === k)).length})
            </button>
          ))}
        </div>
        {estado === "pendiente" && (
          <select aria-label="Confianza" value={confianza} onChange={(e) => setConfianza(e.target.value)}>
            <option value="">Toda confianza</option>
            <option value="alta">Confianza alta</option>
            <option value="media">Confianza media</option>
            <option value="baja">Confianza baja</option>
          </select>
        )}
        <input type="search" placeholder="Buscar compra, proveedor o actividad…" value={buscar} onChange={(e) => setBuscar(e.target.value)} aria-label="Buscar" />
        {estado === "pendiente" && altas.length > 0 && (
          confirmarLote ? (
            <span className="agente-confirmar">
              ¿Asociar las {altas.length} de confianza alta?
              <button type="button" className="btn btn-primary small" disabled={trabajando === "lote"} onClick={() => resolver(altas.map((p) => p.id), "aceptar", "lote")}>{trabajando === "lote" ? "Asociando…" : "Sí, asociar"}</button>
              <button type="button" className="btn small" onClick={() => setConfirmarLote(false)}>No</button>
            </span>
          ) : (
            <button type="button" className="btn" onClick={() => setConfirmarLote(true)}>Asociar las {altas.length} de confianza alta</button>
          )
        )}
      </div>

      <div className="table-card">
        <div className="table-scroll">
          <table className="records ficha-tabla agente-tabla">
            <thead>
              <tr>
                <th>Compra</th><th>Descripción</th><th>Proveedor</th><th className="num">Valor</th>
                <th>{estado === "sin_coincidencia" ? "Resultado" : "Actividad propuesta"}</th>
                {estado !== "sin_coincidencia" && <th>Confianza</th>}
                <th>Por qué</th>
                <th className="actions-col">{estado === "pendiente" ? "Acciones" : "Resuelta"}</th>
              </tr>
            </thead>
            <tbody>
              {!datos && <tr><td colSpan={8}><div className="skeleton-bar" style={{ height: 34, borderRadius: 8 }} /></td></tr>}
              {datos && pag.pagina.length === 0 && <tr><td colSpan={8}><div className="empty">{estado === "pendiente" ? "No hay propuestas por revisar. Usa «Buscar ahora» para que Nova revise las compras sin actividad." : "No hay nada en esta lista."}</div></td></tr>}
              {pag.pagina.map((p) => (
                <tr key={p.id}>
                  <td className="mono">#{p.compra.numero ?? "—"}<br /><span className="muted">{p.compra.fecha}</span></td>
                  <td><Celda texto={p.compra.descripcion} /></td>
                  <td><Celda texto={p.compra.proveedor} ancho={170} /></td>
                  <td className="num">{fmtCOP(p.compra.valor || 0)}</td>
                  <td>
                    {p.actividad
                      ? <span className="agente-act"><Link href={`${p.actividad.linea === "Fundación" ? "/bienestar/fundacion" : "/bienestar"}/actividades/${p.actividad.id}`}>{p.actividad.nombre}</Link><span className="muted">{p.actividad.fecha} · {p.actividad.linea}</span></span>
                      : <span className="muted">Ninguna encaja</span>}
                  </td>
                  {estado !== "sin_coincidencia" && <td>{p.confianza ? <span className={`agente-conf ${p.confianza}`}>{CONFIANZA[p.confianza]}</span> : "—"}</td>}
                  <td><Celda texto={p.razon} ancho={240} /></td>
                  <td className="actions-cell">
                    {p.estado === "pendiente" ? (
                      <span className="agente-acciones">
                        <button type="button" className="btn btn-primary small" disabled={trabajando != null} onClick={() => resolver([p.id], "aceptar", p.id)}>{trabajando === p.id ? "…" : "Sí, asociar"}</button>
                        <button type="button" className="btn small" disabled={trabajando != null} onClick={() => resolver([p.id], "descartar", p.id)}>Descartar</button>
                      </span>
                    ) : (
                      <span className="muted">{p.resueltaPorNombre || p.creadoPorNombre || "—"}{p.resueltaAt ? ` · ${new Date(p.resueltaAt).toLocaleDateString("es-CO")}` : ""}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <PiePagina id="asociador-size" p={pag} total={filas.length} etiqueta="propuesta(s)" />
      </div>
    </div>
  );
}
