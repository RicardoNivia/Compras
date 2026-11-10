"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { fetchAsociadorApi, accionAsociadorApi, revisionDiariaAsociadorApi } from "@/lib/api";
import { fmtCOP } from "@/lib/format";
import { crossfade } from "@/lib/crossfade";
import PiePagina, { usePagina } from "@/components/bienestar/PiePagina";
import { IconSpark, IconLayers, IconSearch, IconClock, IconCheck, IconInfo, IconHistory, IconArrowRight } from "@/components/icons";
import { CabezaAgente, CifraAgente, VacioAgente } from "@/components/bienestar/agentes/comun";

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

  const totalPendiente = pendientes.reduce((s, p) => s + (p.compra.valor || 0), 0);
  const conteo = (k) => propuestas.filter((p) => (k === "aceptada" ? p.estado === "aceptada" || p.estado === "resuelta" : p.estado === k)).length;
  const revisionActiva = !!datos?.revisionDiaria?.activo;

  return (
    <div className="agente-panel">
      <CabezaAgente
        icono={<IconLayers size={22} />}
        color="verde"
        titulo="Asociar compras a su actividad"
        descripcion="Nova revisa las compras del área Bienestar que no tienen actividad y te propone a cuál pertenecen."
        pasos={["Nova compara descripción, fecha, proveedor y categoría", "Tú revisas cada propuesta y su porqué", "Al confirmar, la compra queda asociada"]}
        paso={corriendo ? 0 : pendientes.length ? 1 : 3}
      >
        <button type="button" className="btn btn-primary ag-btn-grande" onClick={iniciarBusqueda} disabled={!datos || corriendo}>
          {corriendo ? <><span className="spinner" /> Nova está revisando…</> : <><IconSearch size={16} /> Buscar ahora</>}
        </button>
        <label className={`ag-switch ${revisionActiva ? "on" : ""}`} title={datos?.revisionDiaria?.actualizadoPorNombre ? `Último cambio: ${datos.revisionDiaria.actualizadoPorNombre}` : undefined}>
          <span className="ag-switch-txt">
            <strong>Revisión diaria</strong>
            <small>{revisionActiva ? "Encendida · avisa en la Bandeja" : "Apagada · solo cuando tú buscas"}</small>
          </span>
          <span className="toggle-switch">
            <input type="checkbox" checked={revisionActiva} disabled={!datos} onChange={(e) => cambiarRevisionDiaria(e.target.checked)} />
            <span className="toggle-track"><span className="toggle-thumb" /></span>
          </span>
        </label>
      </CabezaAgente>

      {corriendo && (
        <div className="ag-trabajando" role="status">
          <span className="ag-trabajando-orbe" aria-hidden="true"><IconSpark size={18} /></span>
          <div><strong>Nova está revisando las compras sin actividad…</strong><small>Puedes seguir aquí; la lista se actualiza sola al terminar.</small></div>
        </div>
      )}

      <section className="ag-cifras" aria-label="Resumen">
        <CifraAgente icono={<IconClock size={18} />} etiqueta="Por revisar" valor={pendientes.length} nota={`${fmtCOP(totalPendiente)} en compras`} tono="destaca" />
        <CifraAgente icono={<IconCheck size={18} />} etiqueta="Confianza alta" valor={altas.length} nota="La compra nombra la actividad" tono="bien" />
        <CifraAgente icono={<IconInfo size={18} />} etiqueta="Sin actividad que encaje" valor={conteo("sin_coincidencia")} nota="Compras generales del área" />
        <CifraAgente
          icono={<IconHistory size={18} />}
          etiqueta="Última revisión"
          valor={datos?.estado?.ultima ? new Date(datos.estado.ultima.at).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" }) : "Aún no"}
          nota={datos?.estado?.ultima ? `${datos.estado.ultima.revisadas} compra(s) revisadas` : "Usa «Buscar ahora» para empezar"}
          pequena
        />
      </section>

      {aviso && <div className="ag-aviso ok" role="status"><IconCheck size={16} /> <span>{aviso}</span></div>}
      {error && <div className="modal-error">{error}</div>}

      {estado === "pendiente" && altas.length > 0 && (
        <div className="ag-lote">
          <span className="ag-lote-icono" aria-hidden="true"><IconSpark size={18} /></span>
          <div className="ag-lote-txt">
            <strong>{altas.length} propuesta(s) con confianza alta</strong>
            <small>La descripción de la compra nombra la actividad. Puedes asociarlas todas de una vez.</small>
          </div>
          {confirmarLote ? (
            <span className="ag-lote-acciones">
              <span>¿Asociar las {altas.length}?</span>
              <button type="button" className="btn btn-primary" disabled={trabajando === "lote"} onClick={() => resolver(altas.map((p) => p.id), "aceptar", "lote")}>{trabajando === "lote" ? "Asociando…" : "Sí, asociar"}</button>
              <button type="button" className="btn" onClick={() => setConfirmarLote(false)}>No</button>
            </span>
          ) : (
            <button type="button" className="btn btn-primary" onClick={() => setConfirmarLote(true)}>Asociar las {altas.length}</button>
          )}
        </div>
      )}

      <div className="ag-lista-card">
        <div className="ag-barra-filtros">
          <div className="ag-segmentos" role="tablist" aria-label="Estado">
            {ESTADOS.map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={estado === k} onClick={() => crossfade(() => setEstado(k))}>
                {l} <span className="ag-num">{conteo(k)}</span>
              </button>
            ))}
          </div>
          <div className="ag-busqueda">
            {estado === "pendiente" && (
              <select aria-label="Confianza" value={confianza} onChange={(e) => setConfianza(e.target.value)}>
                <option value="">Toda confianza</option>
                <option value="alta">Confianza alta</option>
                <option value="media">Confianza media</option>
                <option value="baja">Confianza baja</option>
              </select>
            )}
            <label className="ag-buscar">
              <IconSearch size={15} />
              <input type="search" placeholder="Buscar compra, proveedor o actividad…" value={buscar} onChange={(e) => setBuscar(e.target.value)} aria-label="Buscar" />
            </label>
          </div>
        </div>

        <ul className="ag-propuestas" data-crossfade>
          {!datos && [0, 1, 2].map((i) => <li key={i} className="ag-propuesta"><div className="skeleton-bar" style={{ height: 62, borderRadius: 10, width: "100%" }} /></li>)}
          {datos && pag.pagina.length === 0 && (
            <li>
              <VacioAgente icono={<IconLayers size={26} />} titulo={estado === "pendiente" ? "No hay propuestas por revisar" : "No hay nada en esta lista"}>
                {estado === "pendiente" ? "Usa «Buscar ahora» y Nova revisará las compras del área que no tienen actividad." : null}
              </VacioAgente>
            </li>
          )}
          {pag.pagina.map((p) => (
            <li key={p.id} className={`ag-propuesta ${p.confianza ? `conf-${p.confianza}` : ""}`}>
              <div className="ag-prop-compra">
                <span className="ag-etiqueta">Compra <b className="mono">#{p.compra.numero ?? "—"}</b> · {p.compra.fecha}</span>
                <Celda texto={p.compra.descripcion} ancho={360} />
                <span className="ag-prop-meta"><Celda texto={p.compra.proveedor} ancho={200} /><b>{fmtCOP(p.compra.valor || 0)}</b></span>
              </div>
              <span className="ag-flecha" aria-hidden="true"><IconArrowRight size={18} /></span>
              <div className="ag-prop-actividad">
                <span className="ag-etiqueta">{p.actividad ? "Actividad propuesta" : "Resultado"}</span>
                {p.actividad
                  ? <Link href={`${p.actividad.linea === "Fundación" ? "/bienestar/fundacion" : "/bienestar"}/actividades/${p.actividad.id}`} className="ag-prop-nombre"><Celda texto={p.actividad.nombre} ancho={300} /></Link>
                  : <span className="muted">Ninguna actividad encaja</span>}
                <span className="ag-prop-meta">
                  {p.actividad && <span>{p.actividad.fecha} · {p.actividad.linea}</span>}
                  {p.confianza && <span className={`agente-conf ${p.confianza}`}>Confianza {CONFIANZA[p.confianza].toLowerCase()}</span>}
                </span>
              </div>
              <div className="ag-prop-razon">
                <span className="ag-etiqueta"><IconSpark size={12} /> Por qué</span>
                <Celda texto={p.razon} ancho={320} />
              </div>
              <div className="ag-prop-acciones">
                {p.estado === "pendiente" ? (
                  <>
                    <button type="button" className="btn btn-primary" disabled={trabajando != null} onClick={() => resolver([p.id], "aceptar", p.id)}>{trabajando === p.id ? <span className="spinner" /> : <IconCheck size={14} />} Asociar</button>
                    <button type="button" className="btn ag-btn-suave" disabled={trabajando != null} onClick={() => resolver([p.id], "descartar", p.id)}>Descartar</button>
                  </>
                ) : (
                  <span className="ag-resuelta">
                    {p.estado === "descartada" ? "Descartada" : p.estado === "sin_coincidencia" ? "Revisada" : "Asociada"}
                    <small>{p.resueltaPorNombre || p.creadoPorNombre || "—"}{p.resueltaAt ? ` · ${new Date(p.resueltaAt).toLocaleDateString("es-CO")}` : ""}</small>
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
        <PiePagina id="asociador-size" p={pag} total={filas.length} etiqueta="propuesta(s)" />
      </div>
    </div>
  );
}
