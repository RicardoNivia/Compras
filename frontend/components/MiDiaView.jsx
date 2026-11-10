"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { reviewPendientesApi } from "@/lib/api";
import { IconSpark, IconAlert, IconCheck, IconClock, IconArrowRight } from "@/components/icons";
import { TimelineButton } from "@/components/RecordTimelineModal";
import { AnimatedNumber } from "@/components/charts/chartKit";
import EnviarInformeModal from "@/components/informes/EnviarInformeModal";
import { IconMail } from "@/components/icons";

const PAGE_SIZES = [25, 50, 100];

const NIVEL = {
  critico: { cls: "critical", label: "Urgente" },
  atencion: { cls: "warning", label: "Atención" },
  info: { cls: "accent", label: "Seguimiento" },
  ok: { cls: "good", label: "Al día" },
};

function saludo(nombre) {
  const h = new Date().getHours();
  const momento = h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
  const primero = String(nombre || "").trim().split(/\s+/)[0];
  return primero ? `${momento}, ${primero}` : momento;
}

function Texto({ v, ancho = false }) {
  if (!v) return <span className="muted">—</span>;
  return (
    <span className="desc-tooltip-wrap">
      <span className={`desc-text${ancho ? " desc-text-ancha" : ""}`}>{v}</span>
      <span className="desc-tooltip-bubble">{v}</span>
    </span>
  );
}

function diasPill(dias, nivel) {
  const cls = nivel === "critico" ? "critical" : nivel === "atencion" ? "warning" : "muted";
  return <span className={`pill ${cls}`}><IconClock size={11} /> {dias}</span>;
}

// Tabla de una sección (paginada como el resto de tablas de la app).
function SeccionTabla({ items, dominio, onEnviarInforme }) {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(page, totalPages);
  const visibles = items.slice((current - 1) * pageSize, current * pageSize);
  const esProv = dominio === "proveedores";
  const esBienestar = dominio === "bienestar";
  const esPresupuesto = dominio === "presupuesto";
  const esInformes = dominio === "informes";

  // Si el filtro reduce la lista, la página actual no puede quedar fuera de rango.
  useEffect(() => { setPage(1); }, [items.length, pageSize]);

  return (
    <>
      <div className="table-scroll">
        <table className="audit-log mi-dia-tabla">
          <thead>
            <tr>
              <th>{esProv ? "NIT" : esPresupuesto ? "" : esInformes ? "Período" : esBienestar ? "Línea" : "#"}</th>
              <th>{esProv ? "Proveedor" : esPresupuesto ? "Área" : esInformes ? "Informe" : esBienestar ? "Actividad" : "Descripción"}</th>
              <th>{esPresupuesto ? "Período" : esProv ? "Área · tipo" : esInformes ? "Para" : esBienestar ? "Línea · fecha" : "Proveedor · área"}</th>
              <th>{esPresupuesto ? "% consumido" : esProv || esInformes || esBienestar ? "Días" : "Días háb."}</th>
              <th>Detalle</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((it) => (
              <tr key={it.id} className={it.mio ? "mi-dia-mio" : ""}>
                <td className="mono">{it.ref}</td>
                <td className="truncate"><Texto v={it.titulo} ancho /></td>
                <td className="truncate"><Texto v={it.contexto} /></td>
                <td>
                  {it.dato ? <span className={`pill ${it.nivel === "critico" ? "critical" : "warning"}`}>{it.dato}</span>
                    : it.dias != null && it.dias >= 0 ? diasPill(it.dias, it.nivel) : <span className="muted">—</span>}
                </td>
                <td className="truncate"><Texto v={it.detalle} /></td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    {it.recordId && <TimelineButton recordId={it.recordId} localSeq={Number(String(it.ref).replace("#", "")) || null} />}
                    {it.accion === "enviarInforme" ? (
                      <button type="button" className="btn small btn-primary" onClick={() => onEnviarInforme?.(it.edicionId)} title="Enviar el informe">
                        <IconMail size={11} /> Enviar
                      </button>
                    ) : (
                      <button type="button" className="btn small ir-registro-btn" onClick={() => router.push(it.href)} title="Abrir">
                        Ir <IconArrowRight size={11} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {items.length > PAGE_SIZES[0] && (
        <div className="table-footer">
          <div className="field" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <label style={{ marginBottom: 0 }}>Tamaño</label>
            <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
              {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="page-btns">
            <button type="button" className="btn small" disabled={current <= 1} onClick={() => setPage(current - 1)}>Anterior</button>
            <button type="button" className="btn small" disabled={current >= totalPages} onClick={() => setPage(current + 1)}>Siguiente</button>
          </div>
          <span className="count-note">Página {current} de {totalPages}</span>
          <div className="spacer" />
          <span className="count-note">{items.length} pendiente(s)</span>
        </div>
      )}
    </>
  );
}

function Seccion({ s, items, onEnviarInforme }) {
  const nivel = items.length ? (items.some((i) => i.nivel === "critico") ? "critico" : items.some((i) => i.nivel === "atencion") ? "atencion" : "info") : "ok";
  const criticos = items.filter((i) => i.nivel === "critico").length;
  const [abierta, setAbierta] = useState(false); // todo empieza colapsado; el encabezado ya muestra el conteo y la urgencia
  const n = NIVEL[nivel];
  return (
    <section className={`mi-dia-seccion nivel-${nivel}`} aria-label={s.titulo}>
      <button type="button" className="mi-dia-seccion-head" onClick={() => setAbierta((a) => !a)} aria-expanded={abierta}>
        <span className={`mi-dia-punto ${n.cls}`} aria-hidden="true" />
        <span className="mi-dia-seccion-titulo">
          <strong>{s.titulo}</strong>
          <span className="card-sub" style={{ margin: 0 }}>{s.descripcion}</span>
        </span>
        <span className="mi-dia-seccion-conteo">
          {criticos > 0 && <span className="pill critical pulso">{criticos} urgente(s)</span>}
          <span className={`pill ${n.cls}`}>{items.length}</span>
          <span className="mi-dia-flecha" aria-hidden="true">{abierta ? "▾" : "▸"}</span>
        </span>
      </button>
      {abierta && <SeccionTabla items={items} dominio={s.dominio} onEnviarInforme={onEnviarInforme} />}
    </section>
  );
}

function ResumenNova({ onClose }) {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const generar = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setResult(await reviewPendientesApi());
    } catch (err) {
      setError(err.message || "No se pudo generar el resumen.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { generar(); }, [generar]);

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal kpi-explain-modal" style={{ maxWidth: 620 }}>
        <div className="modal-head">
          <div className="kpi-explain-modal-title">
            <span className="kpi-explain-modal-ic"><IconSpark size={16} /></span>
            <div>
              <h3>Tu día, según Nova</h3>
              <p className="card-sub" style={{ margin: 0 }}>Por dónde empezar con lo que tienes pendiente</p>
            </div>
          </div>
          <button type="button" className="btn-ghost icon-btn" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div className="modal-body" style={{ display: "block" }}>
          {loading && <div className="kpi-explain-loading"><span className="spinner" /> Nova está revisando tus pendientes…</div>}
          {!loading && error && <div className="modal-error"><IconAlert size={13} /> {error}</div>}
          {!loading && !error && result && (
            <div className="prov-ia">
              <p>{result.resumen}</p>
              {result.prioridades?.length > 0 && (
                <>
                  <h4>Empieza por aquí</h4>
                  <ol className="mi-dia-prioridades">
                    {result.prioridades.map((p, i) => <li key={i}>{p}</li>)}
                  </ol>
                </>
              )}
              {result.consejo && <p className="prov-note">{result.consejo}</p>}
            </div>
          )}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn" onClick={generar} disabled={loading}>Volver a resumir</button>
          <div className="spacer" />
          <button type="button" className="btn btn-primary" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

// Los datos llegan ya calculados desde el servidor: la página es dinámica y se vuelve a calcular cada vez que
// se entra a ella (no hay botón de actualizar ni refresco propio).
export default function MiDiaView({ initialData, user }) {
  const data = initialData;
  const [soloMio, setSoloMio] = useState(false);
  const [nova, setNova] = useState(false);
  const [enviarInforme, setEnviarInforme] = useState(null);
  const router = useRouter();

  // "Solo lo mío" filtra los registros de compras donde la persona es responsable: solo se ofrece si tiene alguno.
  const hayMios = useMemo(() => data.secciones.some((s) => s.dominio === "compras" && s.items.some((i) => i.mio)), [data]);

  // Con "Solo lo mío" se muestran únicamente los registros de los que la persona es responsable.
  const secciones = useMemo(() => data.secciones.map((s) => ({
    s,
    items: soloMio && s.dominio === "compras" ? s.items.filter((i) => i.mio) : s.items,
  })), [data, soloMio]);

  const todos = secciones.flatMap((x) => x.items);
  const criticos = todos.filter((i) => i.nivel === "critico").length;
  const atencion = todos.filter((i) => i.nivel === "atencion").length;
  const conItems = secciones.filter((x) => x.items.length > 0);
  const alDia = secciones.filter((x) => x.items.length === 0);
  const hoy = new Date().toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });
  const corte = data.contexto?.diasParaCorte;

  return (
    <div className="mi-dia">
      <div className="mi-dia-cabecera">
        <div>
          <h2 className="mi-dia-saludo">{saludo(user?.nombre)}</h2>
          <p className="card-sub" style={{ margin: 0, textTransform: "capitalize" }}>{hoy}</p>
        </div>
        <div className="mi-dia-resumen" aria-label="Resumen de pendientes">
          <div className="mi-dia-stat"><strong><AnimatedNumber value={todos.length} /></strong><span>pendientes</span></div>
          <div className={`mi-dia-stat${criticos ? " critico" : ""}`}><strong><AnimatedNumber value={criticos} /></strong><span>urgentes</span></div>
          <div className={`mi-dia-stat${atencion ? " atencion" : ""}`}><strong><AnimatedNumber value={atencion} /></strong><span>en atención</span></div>
          {corte != null && (
            <div className={`mi-dia-stat${corte <= 30 ? " atencion" : ""}`}><strong>{corte}</strong><span>días al corte del ciclo</span></div>
          )}
        </div>
      </div>

      <div className="mi-dia-acciones">
        <button type="button" className="btn btn-sync" onClick={() => setNova(true)} disabled={!todos.length}>
          <IconSpark size={14} /> Resumir mi día con Nova
        </button>
        {hayMios && (
          <label className="prov-toggle-row" style={{ margin: 0 }}>
            <input type="checkbox" role="switch" className="prov-switch" checked={soloMio} onChange={(e) => setSoloMio(e.target.checked)} />
            <span>Solo lo mío <span className="muted">(registros donde soy el responsable)</span></span>
          </label>
        )}
      </div>

      {data.secciones.length === 0 ? (
        <div className="empty">Tu rol no tiene pendientes configurados.</div>
      ) : todos.length === 0 ? (
        <div className="mi-dia-vacio">
          <span className="confeti" aria-hidden="true">
            {Array.from({ length: 16 }).map((_, i) => <i key={i} style={{ "--i": i }} />)}
          </span>
          <IconCheck size={26} />
          <h3>Todo al día</h3>
          <p className="card-sub">No tienes pendientes{soloMio ? " propios" : ""} en este momento. Buen trabajo.</p>
        </div>
      ) : (
        conItems.map(({ s, items }) => <Seccion key={s.clave} s={s} items={items} onEnviarInforme={setEnviarInforme} />)
      )}

      {alDia.length > 0 && todos.length > 0 && (
        <p className="mi-dia-aldia">
          <IconCheck size={13} /> Sin pendientes en: {alDia.map(({ s }) => s.titulo).join(" · ")}
        </p>
      )}

      {nova && <ResumenNova onClose={() => setNova(false)} />}
      {enviarInforme && <EnviarInformeModal edicionId={enviarInforme} onClose={() => setEnviarInforme(null)} onEnviado={() => router.refresh()} />}
    </div>
  );
}
