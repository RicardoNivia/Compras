"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { crearObservacionApi, eliminarObservacionApi, fetchObservacionesApi } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import HBarChartSvg from "@/components/charts/HBarChartSvg";
import ImportarNovaModal from "@/components/bienestar/ImportarNovaModal";
import PiePagina, { usePagina, PAGE_SIZES, PAGE_SIZES_MODAL } from "@/components/bienestar/PiePagina";
import { EsqueletoTabla } from "@/components/bienestar/Esqueletos";
import { IconDownload, IconPlus, IconTrash } from "@/components/icons";
import { ComentarioConMano, ManoSentimiento } from "@/components/bienestar/Sentimiento";

const ORIGENES = { equipo: "Equipo", participante: "Participante", cierre: "Cierre", actividad: "Actividad" };
const entero = (v) => Math.round(v).toLocaleString("es-CO");

// Pestaña de la ficha: la encuesta de satisfacción (se importa aquí) y todas las observaciones de la actividad en una
// sola tabla, con las que agrega el equipo. enModal: solo la tabla, para leerla desde el detalle del cronograma.
export default function ObservacionesActividad({ act, puedeEditar = false, onCambio, enModal = false }) {
  const [datos, setDatos] = useState(null);
  const [buscar, setBuscar] = useState("");
  const [filtro, setFiltro] = useState(enModal ? "comentario" : "");
  const [texto, setTexto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [importar, setImportar] = useState(null);
  const [aviso, setAviso] = useState("");
  const [error, setError] = useState("");

  const cargar = useCallback(() => {
    fetchObservacionesApi(act.id).then(setDatos).catch((e) => setError(e.message || "No se pudieron cargar las observaciones."));
  }, [act.id]);
  useEffect(() => { cargar(); }, [cargar]);

  // Mientras Nova clasifica comentarios recién escritos o importados (corre en segundo plano en el servidor), la tabla
  // se vuelve a consultar sola cada 4 s para que las manitos aparezcan sin recargar. Se detiene cuando no queda nada
  // por clasificar o tras 2 minutos (comentarios viejos que quedaron sin clasificar no se esperan para siempre).
  const intentos = useRef(0);
  const porClasificar = datos?.resumen?.sinClasificar || 0;
  const analizando = porClasificar > 0 && intentos.current < 30;
  useEffect(() => {
    if (!porClasificar || intentos.current >= 30) return undefined;
    const t = setTimeout(() => { intentos.current += 1; cargar(); }, 4000);
    return () => clearTimeout(t);
  }, [datos, porClasificar, cargar]);

  const filtradas = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return (datos?.observaciones || []).filter((o) => (!filtro || (filtro === "comentario" ? !!o.texto : filtro.startsWith("s:") ? o.sentimiento === filtro.slice(2) : o.tipo === filtro))
      && (!q || `${o.quien} ${o.area || ""} ${o.texto || ""}`.toLowerCase().includes(q)));
  }, [datos, buscar, filtro]);
  const pag = usePagina(filtradas, `${buscar}|${filtro}`, enModal ? PAGE_SIZES_MODAL[0] : PAGE_SIZES[0]);

  async function agregar(e) {
    e.preventDefault();
    setGuardando(true);
    setError("");
    setAviso("");
    try {
      const { observacion: nueva } = await crearObservacionApi(act.id, { texto });
      setTexto("");
      setAviso(nueva?.sentimiento ? "Observación agregada y analizada por Nova." : "Observación agregada. Nova la está analizando: la manito aparece en unos segundos.");
      intentos.current = 0;
      cargar();
      onCambio();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  async function quitar(o) {
    if (!window.confirm("¿Quitar esta observación?")) return;
    setError("");
    setAviso("");
    try {
      await eliminarObservacionApi(act.id, o.id);
      cargar();
      onCambio();
    } catch (err) {
      setError(err.message);
    }
  }

  if (!datos) return error ? <div className="modal-error">{error}</div> : <EsqueletoTabla etiqueta="Cargando las observaciones" />;
  const { resumen } = datos;

  return (
    <div className={enModal ? "ficha-seccion resumen-card" : "ficha-seccion"}>
      {!enModal && act.aplicaParticipantes && (
        <div className="actividad-cifras">
          <div><span>Calificación promedio</span><strong>{resumen.promedio != null ? `${resumen.promedio.toFixed(1).replace(".", ",")} / 5` : "—"}</strong></div>
          <div><span>Calificaciones</span><strong>{entero(resumen.calificaciones)}</strong></div>
          <div><span>Comentarios de participantes</span><strong>{entero(resumen.comentarios)}</strong></div>
          <div><span>Observaciones del equipo</span><strong>{entero(resumen.notasEquipo)}</strong></div>
          <div>
            <span>Tono de los comentarios{resumen.sinClasificar ? ` · ${entero(resumen.sinClasificar)} por clasificar` : ""}</span>
            <strong className="tono-resumen">
              <span><ManoSentimiento valor="positivo" />{entero(resumen.sentimientos.positivo)}</span>
              <span><ManoSentimiento valor="neutro" />{entero(resumen.sentimientos.neutro)}</span>
              <span><ManoSentimiento valor="negativo" />{entero(resumen.sentimientos.negativo)}</span>
              <span><ManoSentimiento valor="no_aplica" />{entero(resumen.sentimientos.no_aplica)}</span>
            </strong>
          </div>
        </div>
      )}

      {/* De un vistazo: cuántos comentarios a favor y en contra, su porcentaje y la participación de la actividad. */}
      <TarjetasTono s={resumen.sentimientos} participacion={act.participacion} aplica={act.aplicaParticipantes} />

      {puedeEditar && act.aplicaParticipantes && (
        <div className="importar-tarjetas">
          <label className="importar-tarjeta">
            <input type="file" accept=".xlsx,.xls" className="importar-input" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) { setError(""); setAviso(""); setImportar(f); } }} />
            <IconDownload size={15} style={{ transform: "rotate(180deg)" }} />
            <span><strong>Importar calificaciones</strong><span className="count-note">La encuesta de satisfacción de la actividad. Nova lo lee y te muestra qué va a cargar.</span></span>
          </label>
        </div>
      )}
      {importar && (
        <ImportarNovaModal
          actividadId={act.id}
          tipo="calificaciones"
          archivo={importar}
          onClose={() => setImportar(null)}
          onListo={(msg) => { setImportar(null); setAviso(msg); intentos.current = 0; cargar(); onCambio(); }}
        />
      )}

      {!enModal && <div className="resumen-fila">
        {puedeEditar && (
          <section className="resumen-card" aria-labelledby="ob-nueva">
            <h2 id="ob-nueva">Agregar observación</h2>
            <p className="card-sub">Queda con tu nombre y la fecha. Nova la tiene en cuenta al analizar la actividad.</p>
            <form className="observacion-form" onSubmit={agregar}>
              <div className="field">
                <label htmlFor="ob-texto">Observación</label>
                <textarea id="ob-texto" rows={3} maxLength={2000} placeholder="Qué pasó, qué salió bien, qué hay que tener en cuenta la próxima vez…" value={texto} onChange={(e) => setTexto(e.target.value)} />
              </div>
              <button type="submit" className="btn btn-primary" disabled={guardando || !texto.trim()}>{guardando ? <span className="spinner" /> : <IconPlus size={13} />} {guardando ? "Nova está analizando…" : "Agregar"}</button>
            </form>
          </section>
        )}
        {act.aplicaParticipantes && (
          <section className="resumen-card" aria-labelledby="ob-dist">
            <h2 id="ob-dist">Cómo calificaron</h2>
            <p className="card-sub">{resumen.calificaciones ? `${entero(resumen.calificaciones)} persona(s) calificaron la actividad.` : "Aún no hay calificaciones."}</p>
            {resumen.calificaciones > 0 && (
              <HBarChartSvg data={resumen.distribucion.map((d) => ({ key: String(d.estrellas), label: `${d.estrellas} ★`, value: d.n }))} formatValue={entero} color="var(--accent)" />
            )}
          </section>
        )}
      </div>}

      {aviso && <div className="ficha-aviso" role="status">{aviso}</div>}
      {analizando && (
        <div className="ficha-aviso" role="status">
          <span className="spinner" /> Nova está analizando {entero(porClasificar)} comentario(s) para ponerles la manito (a favor, neutro o en contra). Aparecen solas en la tabla.
        </div>
      )}
      {error && <div className="modal-error">{error}</div>}

      <div className="toolbar" style={{ flexWrap: "wrap", gap: 10 }}>
        <div className="field search-field">
          <label htmlFor="ob-buscar">Buscar</label>
          <input id="ob-buscar" type="search" placeholder="Persona, área u observación…" value={buscar} onChange={(e) => setBuscar(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="ob-filtro">Mostrar</label>
          <select id="ob-filtro" value={filtro} onChange={(e) => setFiltro(e.target.value)}>
            <option value="">Todas</option>
            <option value="comentario">Solo con comentario</option>
            <option value="s:positivo">Positivos</option>
            <option value="s:neutro">Neutros</option>
            <option value="s:negativo">Negativos</option>
            <option value="s:no_aplica">Que no aplican (N/A)</option>
            <option value="equipo">Del equipo</option>
            <option value="participante">De participantes</option>
            <option value="cierre">Del cierre</option>
            <option value="actividad">De la actividad</option>
          </select>
        </div>
      </div>

      <div className="table-card">
        <div className="table-scroll">
          <table className="records ficha-tabla">
            <thead>
              <tr><th>Origen</th><th>Quién</th><th>Área</th><th className="num">Calif.</th><th>Observación</th><th>Fecha</th>{puedeEditar && <th className="actions-col">Acciones</th>}</tr>
            </thead>
            <tbody>
              {pag.pagina.length === 0 && <tr><td colSpan={puedeEditar ? 7 : 6}><div className="empty">{datos.observaciones.length ? "Nada coincide con los filtros." : "Aún no hay calificaciones ni observaciones."}</div></td></tr>}
              {pag.pagina.map((o) => (
                <tr key={o.clave}>
                  <td><span className="pill muted">{ORIGENES[o.tipo]}</span></td>
                  <td><span className="desc-tooltip-wrap"><span className="desc-text">{o.quien}</span><span className="desc-tooltip-bubble">{o.quien}</span></span></td>
                  <td className="truncate">{o.area || "—"}</td>
                  <td className="num">{o.calificacion ? `${o.calificacion} ★` : "—"}</td>
                  <td>{o.texto ? <ComentarioConMano texto={o.texto} sentimiento={o.sentimiento} /> : <span className="muted">Sin comentario</span>}</td>
                  <td>{o.fecha ? fmtDateTime(o.fecha) : "—"}</td>
                  {puedeEditar && (
                    <td className="actions-cell">
                      {o.tipo === "equipo" && <button type="button" className="icon-action-btn delete" title="Quitar observación" aria-label={`Quitar la observación de ${o.quien}`} onClick={() => quitar(o)}><IconTrash size={13} /></button>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <PiePagina id="ob-size" p={pag} total={filtradas.length} etiqueta="registro(s)" tamanos={enModal ? PAGE_SIZES_MODAL : PAGE_SIZES} excel={{ nombre: "observaciones", hoja: "Observaciones", filas: filtradas, columnas: [
          { t: "Origen", v: (o) => ORIGENES[o.tipo] || o.tipo }, { t: "Quién", v: (o) => o.quien }, { t: "Área", v: (o) => o.area }, { t: "Calificación", v: (o) => o.calificacion },
          { t: "Observación", v: (o) => o.texto }, { t: "Sentimiento", v: (o) => o.sentimiento }, { t: "Fecha", v: (o) => (o.fecha ? fmtDateTime(o.fecha) : "") },
        ] }} />
      </div>
    </div>
  );
}

// Tarjetas del tono: % sobre los comentarios con opinión (los N/A no cuentan). Participación = asistieron / inscritos.
function TarjetasTono({ s, participacion: p, aplica }) {
  const conOpinion = s.positivo + s.neutro + s.negativo;
  const pct = (n) => (conOpinion ? `${Math.round((n / conOpinion) * 100)} %` : "—");
  const base = p ? Math.max(p.inscritos || 0, p.asistieron || 0) : 0;
  const part = aplica && base ? Math.round(((p.asistieron || 0) / base) * 1000) / 10 : null;
  return (
    <div className="tono-tarjetas">
      <div className="tono-tarjeta positivo"><ManoSentimiento valor="positivo" /><span>A favor</span><strong>{entero(s.positivo)}</strong><small>{pct(s.positivo)} de los comentarios con opinión</small></div>
      <div className="tono-tarjeta negativo"><ManoSentimiento valor="negativo" /><span>En contra</span><strong>{entero(s.negativo)}</strong><small>{pct(s.negativo)} de los comentarios con opinión</small></div>
      <div className="tono-tarjeta neutro"><ManoSentimiento valor="neutro" /><span>Neutros</span><strong>{entero(s.neutro)}</strong><small>{pct(s.neutro)} · {entero(s.no_aplica)} sin opinión (N/A)</small></div>
      <div className="tono-tarjeta part"><span>Participación</span><strong>{part != null ? `${String(part).replace(".", ",")} %` : "—"}</strong><small>{aplica && p ? `${entero(p.asistieron || 0)} asistieron de ${entero(base)} inscritos` : "Esta actividad no maneja participantes"}</small></div>
    </div>
  );
}
