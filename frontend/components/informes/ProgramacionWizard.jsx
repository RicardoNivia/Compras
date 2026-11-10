"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { novaInformeApi, proximasFechasApi, generarEdicionApi } from "@/lib/api";
import { isHoliday } from "@/lib/businessDays";
import { IconSpark, IconCheck, IconAlert, IconMail, IconDownload, IconHistory } from "@/components/icons";
import EnviarInformeModal from "@/components/informes/EnviarInformeModal";
import { DIAS, FRECUENCIAS, ORDINALES, PERIODOS, VARIABLES, periodoCorto } from "@/components/informes/estudioUtils";

// Programar un informe en tres pasos: 1) cuándo (en lenguaje natural, Nova lo convierte en regla y se ven las
// próximas fechas con los festivos), qué período cubre y bajo qué condición; 2) a quién va el correo y cómo se
// entrega (hoy solo "Lo envío yo"; correo automático en espera de IT y Teams próximamente); 3) revisar y activar.

const EJEMPLOS = ["Cada viernes a las 7:30", "El último día hábil del mes", "El primer lunes hábil de cada mes a las 8", "Solo una vez, el 30 de octubre"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function CorreosInput({ id, valores, onChange, placeholder }) {
  const [texto, setTexto] = useState("");
  const [error, setError] = useState("");
  function agregar(raw) {
    const nuevos = String(raw || "").split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);
    if (!nuevos.length) return;
    const malos = nuevos.filter((x) => !EMAIL_RE.test(x));
    if (malos.length) { setError(`"${malos[0]}" no es un correo válido.`); return; }
    onChange([...new Set([...valores, ...nuevos])]);
    setTexto("");
    setError("");
  }
  return (
    <>
      <div className="est-mail" onClick={() => document.getElementById(id)?.focus()}>
        {valores.map((v) => (
          <span key={v} className="est-mail-pill">{v}<button type="button" aria-label={`Quitar ${v}`} onClick={() => onChange(valores.filter((x) => x !== v))}>✕</button></span>
        ))}
        <input
          id={id} value={texto} placeholder={valores.length ? "Agregar…" : placeholder}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (["Enter", ",", ";", "Tab"].includes(e.key) && texto.trim()) { e.preventDefault(); agregar(texto); } }}
          onBlur={() => texto.trim() && agregar(texto)}
        />
      </div>
      {error && <span className="modal-error">{error}</span>}
    </>
  );
}

function Calendario({ proximas, sabadoHabil, domingoHabil }) {
  const primera = proximas[0] ? new Date(proximas[0].fecha) : new Date();
  const [ref, setRef] = useState(new Date(primera.getFullYear(), primera.getMonth(), 1));
  useEffect(() => { setRef(new Date(primera.getFullYear(), primera.getMonth(), 1)); }, [proximas[0]?.dia]); // eslint-disable-line react-hooks/exhaustive-deps
  const y = ref.getFullYear();
  const m = ref.getMonth();
  const inicio = (new Date(y, m, 1).getDay() + 6) % 7; // lunes primero
  const dias = new Date(y, m + 1, 0).getDate();
  const envios = new Set(proximas.map((p) => p.dia));
  const hoy = new Date();
  const celdas = [];
  for (let i = 0; i < inicio; i++) celdas.push(<span key={`v${i}`} className="x" />);
  for (let d = 1; d <= dias; d++) {
    const f = new Date(y, m, d);
    const key = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const noHabil = (f.getDay() === 6 && !sabadoHabil) || (f.getDay() === 0 && !domingoHabil);
    const cls = envios.has(key) ? "send" : isHoliday(f) ? "fest" : noHabil ? "x" : "";
    const esHoy = f.toDateString() === hoy.toDateString();
    celdas.push(<span key={d} className={`${cls}${esHoy ? " hoy" : ""}`} title={envios.has(key) ? "Se genera el informe" : isHoliday(f) ? "Festivo" : undefined}>{d}</span>);
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center" }}>
        <button type="button" className="btn small btn-ghost" aria-label="Mes anterior" onClick={() => setRef(new Date(y, m - 1, 1))}>‹</button>
        <strong style={{ flex: 1, textAlign: "center", fontFamily: "Nunito, sans-serif", textTransform: "capitalize" }}>{ref.toLocaleDateString("es-CO", { month: "long", year: "numeric" })}</strong>
        <button type="button" className="btn small btn-ghost" aria-label="Mes siguiente" onClick={() => setRef(new Date(y, m + 1, 1))}>›</button>
      </div>
      <div className="est-cal" role="grid" aria-label="Calendario">
        {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => <span key={i} className="h">{d}</span>)}
        {celdas}
      </div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12 }} className="muted">
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 12, height: 12, borderRadius: 4, background: "var(--accent)" }} />Se genera</span>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ color: "var(--critical)", textDecoration: "line-through", fontWeight: 700 }}>2</span>Festivo</span>
      </div>
    </div>
  );
}

// modo "foto": informes solo para consultar. Solo el paso "Cuándo": a esa hora se guarda una foto automática del
// informe en su histórico (Fotos guardadas), sin destinatarios ni envío.
export default function ProgramacionWizard({ informe, onCambio, onGuardar, onVistaPrevia, guardando, modo = "enviar", onVerFotos }) {
  const modoFoto = modo === "foto";
  const [paso, setPaso] = useState(1);
  const [interpretando, setInterpretando] = useState(false);
  const [aclaracion, setAclaracion] = useState("");
  const [manual, setManual] = useState(false);
  const [proximas, setProximas] = useState([]);
  const [descripcion, setDescripcion] = useState("");
  const [redactando, setRedactando] = useState(false);
  const [error, setError] = useState("");
  const [probando, setProbando] = useState(false);
  const [prueba, setPrueba] = useState(null);
  const [activado, setActivado] = useState(false);
  const [catalogo, setCatalogo] = useState([]);
  const asuntoRef = useRef(null);
  const mensajeRef = useRef(null);

  const regla = useMemo(() => ({
    frecuencia: informe.frecuencia, diaSemana: informe.diaSemana, diaMes: informe.diaMes, ordinal: informe.ordinal,
    fechaUnica: informe.fechaUnica, hora: informe.hora, saltarFestivos: informe.saltarFestivos !== false,
    sabadoHabil: !!informe.sabadoHabil, domingoHabil: !!informe.domingoHabil,
  }), [informe.frecuencia, informe.diaSemana, informe.diaMes, informe.ordinal, informe.fechaUnica, informe.hora, informe.saltarFestivos, informe.sabadoHabil, informe.domingoHabil]);

  useEffect(() => {
    let vivo = true;
    const t = setTimeout(() => {
      proximasFechasApi(regla).then((r) => { if (vivo) { setProximas(r.proximas || []); setDescripcion(r.descripcion || ""); } }).catch(() => {});
    }, 250);
    return () => { vivo = false; clearTimeout(t); };
  }, [regla]);

  useEffect(() => {
    fetch("/api/maestros?tipo=responsable&onlyActive=1", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { maestros: [] }))
      .then((d) => setCatalogo((d.maestros || []).filter((m) => m.userId).map((m) => ({ id: m.userId, nombre: m.valor }))))
      .catch(() => {});
  }, []);

  async function interpretar(texto) {
    const t = (texto ?? informe.reglaTexto ?? "").trim();
    if (!t) return;
    setInterpretando(true);
    setAclaracion("");
    try {
      const r = await novaInformeApi("programacion", { texto: t });
      if (!r.entendible) { setAclaracion(r.aclaracion); return; }
      onCambio({ reglaTexto: t, ...r.regla });
    } catch (e) {
      setAclaracion(e.message || "No pude interpretar la frase.");
    } finally {
      setInterpretando(false);
    }
  }

  async function redactar() {
    setRedactando(true);
    setError("");
    try {
      const r = await novaInformeApi("mensaje", { nombre: informe.nombre, contexto: informe.contexto });
      onCambio({ asunto: r.asunto, mensaje: r.mensaje });
    } catch (e) {
      setError(e.message || "Nova no pudo redactar el mensaje.");
    } finally {
      setRedactando(false);
    }
  }

  function insertarVariable(v, campo) {
    const el = campo === "asunto" ? asuntoRef.current : mensajeRef.current;
    const valor = informe[campo] || "";
    const pos = el?.selectionStart ?? valor.length;
    onCambio({ [campo]: `${valor.slice(0, pos)}${v}${valor.slice(pos)}` });
    setTimeout(() => el?.focus(), 0);
  }

  async function probar() {
    setProbando(true);
    setError("");
    try {
      await onGuardar({});
      const r = await generarEdicionApi(informe.id, "prueba");
      setPrueba(r.edicion.id);
    } catch (e) {
      setError(e.message || "No se pudo generar la prueba.");
    } finally {
      setProbando(false);
    }
  }

  async function activar() {
    setError("");
    if (!informe.destinatarios?.length) { setPaso(2); setError("Agrega al menos un destinatario: es a quien le escribirás el correo."); return; }
    try {
      await onGuardar({ esBorrador: false, activo: true });
      setActivado(true);
    } catch (e) {
      setError(e.message || "No se pudo activar.");
    }
  }

  const responsables = informe.responsables || [];
  const avisoActivo = informe.contexto?.avisarMiDia !== false;
  const pasos = modoFoto ? [{ n: 1, t: "Cuándo guardar la foto" }] : [{ n: 1, t: "Cuándo" }, { n: 2, t: "Destinatarios y entrega" }, { n: 3, t: "Revisar y activar" }];
  const fotosActivas = !informe.esBorrador && informe.activo;

  return (
    <div className="est">
      <nav className="est-steps" aria-label="Pasos">
        {pasos.map((p, i) => (
          <span key={p.n} style={{ display: "contents" }}>
            {i > 0 && <span className="est-step-line" aria-hidden="true" />}
            <button type="button" className={`est-step${paso === p.n ? " on" : paso > p.n ? " done" : ""}`} aria-current={paso === p.n ? "step" : undefined} onClick={() => setPaso(p.n)}>
              <b>{paso > p.n ? "✓" : p.n}</b>{p.t}
            </button>
          </span>
        ))}
        <div className="spacer" />
        {!modoFoto && !informe.esBorrador && informe.activo && <span className="est-chip ok">Programación activa</span>}
        {!modoFoto && !informe.esBorrador && !informe.activo && <span className="est-chip warn">En pausa</span>}
      </nav>

      {paso === 1 && (
        <div className="est-row">
          <div className="est-grow" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <section className="est-card" style={{ display: "flex", flexDirection: "column", gap: 14 }} aria-labelledby="cuando-t">
              <div>
                <h2 id="cuando-t">{modoFoto ? "¿Cuándo se guarda la foto automática?" : "¿Cuándo debe generarse?"}</h2>
                <p className="est-sub">Escríbelo con tus palabras. Nova lo convierte en una regla y te muestra las próximas fechas para que confirmes.</p>
              </div>
              <form className="est-composer" onSubmit={(e) => { e.preventDefault(); interpretar(); }}>
                <label htmlFor="regla" style={{ position: "absolute", left: -9999 }}>Cuándo generar el informe</label>
                <textarea id="regla" rows={1} style={{ minHeight: 30 }} value={informe.reglaTexto || ""} placeholder="Ej.: el primer lunes hábil de cada mes a las 8 de la mañana" onChange={(e) => onCambio({ reglaTexto: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); interpretar(); } }} />
                <button type="submit" className="btn btn-nova" disabled={interpretando || !(informe.reglaTexto || "").trim()}>
                  {interpretando ? <span className="spinner" /> : <IconSpark size={14} />} Interpretar
                </button>
              </form>
              {aclaracion && <div className="modal-error"><IconAlert size={13} /> {aclaracion}</div>}
              <div className="est-chips" style={{ alignItems: "center" }}>
                <span className="muted" style={{ fontSize: 12.5 }}>Regla:</span>
                <span className="est-chip">{descripcion || "…"}</span>
                {informe.saltarFestivos !== false && <span className="est-chip ok">Salta festivos</span>}
                <button type="button" className="btn small btn-ghost" onClick={() => setManual((v) => !v)}>{manual ? "Ocultar ajuste manual" : "Ajustar a mano"}</button>
              </div>
              <div className="est-ideas">
                <span className="muted" style={{ fontSize: 12.5 }}>Ejemplos:</span>
                {EJEMPLOS.map((t) => <button key={t} type="button" className="btn" onClick={() => { onCambio({ reglaTexto: t }); interpretar(t); }}>{t}</button>)}
              </div>
              <div className="est-props" style={{ gap: 8 }}>
                <span className="est-eyebrow">Días hábiles</span>
                <span className="muted" style={{ fontSize: 12 }}>De lunes a viernes siempre son hábiles. Elige si el sábado y el domingo también cuentan; los festivos colombianos se saltan.</span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 24px" }}>
                  <label className="est-switch">
                    <input type="checkbox" role="switch" checked={!!informe.sabadoHabil} onChange={(e) => onCambio({ sabadoHabil: e.target.checked })} />
                    El sábado es día hábil
                  </label>
                  <label className="est-switch">
                    <input type="checkbox" role="switch" checked={!!informe.domingoHabil} onChange={(e) => onCambio({ domingoHabil: e.target.checked })} />
                    El domingo es día hábil
                  </label>
                  <label className="est-switch">
                    <input type="checkbox" role="switch" checked={informe.saltarFestivos !== false} onChange={(e) => onCambio({ saltarFestivos: e.target.checked })} />
                    Saltar festivos (pasa al siguiente día hábil)
                  </label>
                </div>
              </div>
              {manual && (
                <div className="est-props" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
                  <div className="field" style={{ gridColumn: "1 / -1" }}><label htmlFor="m-frec">Frecuencia</label>
                    <select id="m-frec" value={informe.frecuencia} onChange={(e) => onCambio({ frecuencia: e.target.value, diaSemana: informe.diaSemana ?? 1, diaMes: informe.diaMes ?? 1, ordinal: informe.ordinal ?? 1 })}>
                      {FRECUENCIAS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                  </div>
                  {informe.frecuencia === "mensual_semana" && (
                    <div className="field"><label htmlFor="m-ord">¿Cuál?</label>
                      <select id="m-ord" value={informe.ordinal ?? 1} onChange={(e) => onCambio({ ordinal: Number(e.target.value) })}>
                        {ORDINALES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                  )}
                  {(informe.frecuencia === "mensual_semana" || informe.frecuencia === "semanal") && (
                    <div className="field"><label htmlFor="m-dia">Día</label>
                      <select id="m-dia" value={informe.diaSemana ?? 1} onChange={(e) => onCambio({ diaSemana: Number(e.target.value) })}>
                        {DIAS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                      </select>
                    </div>
                  )}
                  {informe.frecuencia === "mensual" && (
                    <div className="field"><label htmlFor="m-dm">Día del mes</label>
                      <select id="m-dm" value={informe.diaMes ?? 1} onChange={(e) => onCambio({ diaMes: Number(e.target.value) })}>
                        {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d === 31 ? "Fin de mes" : d}</option>)}
                      </select>
                    </div>
                  )}
                  {informe.frecuencia === "unica" && (
                    <div className="field"><label htmlFor="m-fu">Fecha</label><input id="m-fu" type="date" value={informe.fechaUnica || ""} onChange={(e) => onCambio({ fechaUnica: e.target.value })} /></div>
                  )}
                  <div className="field"><label htmlFor="m-hora">Hora</label><input id="m-hora" type="time" value={informe.hora || "08:00"} onChange={(e) => onCambio({ hora: e.target.value })} /></div>
                </div>
              )}
            </section>

            <section className="est-card" style={{ display: "flex", flexDirection: "column", gap: 12 }} aria-labelledby="per-t">
              <h2 id="per-t">¿Qué período cubre cada envío?</h2>
              <div className="est-opciones">
                {PERIODOS.map((p) => (
                  <label key={p.value} className={`est-opt${informe.periodoGeneral === p.value ? " on" : ""}`}>
                    <input type="radio" name="periodo" checked={informe.periodoGeneral === p.value} onChange={() => onCambio({ periodoGeneral: p.value })} />
                    <span><strong>{p.label}</strong><br /><span className="muted" style={{ fontSize: 12 }}>{p.ayuda}</span></span>
                  </label>
                ))}
              </div>
            </section>

          </div>

          <aside className="est-card est-side" style={{ display: "flex", flexDirection: "column", gap: 16 }} aria-labelledby="prox-t">
            <h2 id="prox-t">Próximas fechas</h2>
            <Calendario proximas={proximas} sabadoHabil={!!informe.sabadoHabil} domingoHabil={!!informe.domingoHabil} />
            <ol className="est-fechas">
              {proximas.map((p) => {
                const d = new Date(p.fecha);
                return (
                  <li key={p.dia} className={p.nota ? "nota" : ""}>
                    <span className="mono" style={{ fontWeight: 600, textTransform: "capitalize" }}>{d.toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span>
                    <span className="spacer" />
                    {p.nota && <span style={{ fontSize: 12, color: "var(--warning)" }}>{p.nota}</span>}
                  </li>
                );
              })}
              {proximas.length === 0 && <li className="muted">Sin fechas con esta regla.</li>}
            </ol>
            <p className="muted" style={{ fontSize: 12, margin: 0 }}>Días no hábiles en gris; festivos colombianos tachados. {informe.sabadoHabil || informe.domingoHabil ? `Cuentan como hábiles: ${[informe.sabadoHabil && "sábado", informe.domingoHabil && "domingo"].filter(Boolean).join(" y ")}.` : "Sábado y domingo no son hábiles."}</p>
          </aside>
        </div>
      )}

      {paso === 2 && (
        <div className="est-row">
          <section className="est-card est-grow" style={{ display: "flex", flexDirection: "column", gap: 16 }} aria-labelledby="correo-t">
            <div>
              <h2 id="correo-t">El correo que recibirán</h2>
              <p className="est-sub">Queda guardado con el informe. Hoy lo usas tú al enviarlo desde Outlook; cuando haya correo automático, se enviará exactamente así.</p>
            </div>
            <div className="field"><label htmlFor="para">Para</label>
              <CorreosInput id="para" valores={informe.destinatarios || []} onChange={(v) => onCambio({ destinatarios: v })} placeholder="Escribe un correo y presiona Enter…" />
            </div>
            <div className="field"><label htmlFor="cc">Con copia (opcional)</label>
              <CorreosInput id="cc" valores={informe.cc || []} onChange={(v) => onCambio({ cc: v })} placeholder="Agregar…" />
            </div>
            <div className="field"><label htmlFor="asunto">Asunto</label>
              <input id="asunto" ref={asuntoRef} value={informe.asunto || ""} onChange={(e) => onCambio({ asunto: e.target.value })} />
              <span className="muted" style={{ fontSize: 12, display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                Se completa solo:{VARIABLES.filter((v) => v !== "{resumen_nova}").map((v) => <button key={v} type="button" className="est-var" onClick={() => insertarVariable(v, "asunto")}>{v}</button>)}
              </span>
            </div>
            <div className="field">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <label htmlFor="mensaje">Mensaje</label>
                <div className="spacer" />
                <button type="button" className="btn small btn-nova" onClick={redactar} disabled={redactando}>{redactando ? <span className="spinner" /> : <IconSpark size={13} />} Redactar con Nova</button>
              </div>
              <textarea id="mensaje" ref={mensajeRef} rows={7} value={informe.mensaje || ""} onChange={(e) => onCambio({ mensaje: e.target.value })} />
              <span className="muted" style={{ fontSize: 12, display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                Variables:{VARIABLES.map((v) => <button key={v} type="button" className="est-var" onClick={() => insertarVariable(v, "mensaje")}>{v}</button>)}
              </span>
              <span className="muted" style={{ fontSize: 12 }}><span className="est-var" style={{ cursor: "default" }}>{"{resumen_nova}"}</span> son 2 o 3 frases que Nova escribe con las cifras de cada envío. El PDF va siempre adjunto.</span>
            </div>
          </section>

          <section className="est-side" style={{ display: "flex", flexDirection: "column", gap: 12 }} aria-labelledby="entrega-t">
            <div>
              <h2 id="entrega-t" style={{ fontFamily: "Nunito, sans-serif", fontSize: 17, margin: 0 }}>¿Cómo se entrega?</h2>
              <p className="est-sub">Por ahora el envío lo haces tú. Las demás opciones quedan listas para más adelante.</p>
            </div>
            <div className={`est-opt${informe.entrega === "yo" ? " on" : ""}`}>
              <input type="radio" name="entrega" aria-label="Lo envío yo" checked={informe.entrega === "yo"} onChange={() => onCambio({ entrega: "yo" })} />
              <span className="est-ch-ic"><IconDownload size={18} /></span>
              <span style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
                <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><strong>Lo envío yo</strong><span className="est-chip ok">Disponible</span></span>
                <span style={{ fontSize: 12.5, lineHeight: 1.5 }}>A la hora programada el sistema genera el PDF y avisa en <strong>Mi día</strong>. Con un clic abres Outlook con destinatarios, asunto y mensaje listos; solo adjuntas el PDF.</span>
                <label className="est-switch" style={{ fontWeight: 600, padding: "6px 0" }}>
                  <input type="checkbox" className="prov-switch" role="switch" checked={avisoActivo} onChange={(e) => onCambio({ contexto: { ...informe.contexto, avisarMiDia: e.target.checked } })} />
                  {avisoActivo ? "Aviso en Mi día activado" : "Aviso en Mi día desactivado"}
                </label>
                {!avisoActivo && (
                  <span className="muted" style={{ fontSize: 12, lineHeight: 1.45 }}>El informe se seguirá generando a su hora y quedará en el Historial de envíos, pero no aparecerá en Mi día.</span>
                )}
                <span style={{ display: avisoActivo ? "flex" : "none", flexWrap: "wrap", alignItems: "center", gap: 6, fontSize: 12.5 }} className="muted">
                  Avisar a:
                  {responsables.map((r) => (
                    <span key={r.id} className="est-chip">{r.nombre || "Usuario"}{responsables.length > 1 && <button type="button" aria-label={`Quitar ${r.nombre}`} onClick={() => onCambio({ responsables: responsables.filter((x) => x.id !== r.id) })}>✕</button>}</span>
                  ))}
                  {catalogo.length > 0 && (
                    <select aria-label="Agregar responsable" value="" style={{ width: "auto", padding: "4px 8px", fontSize: 12 }} onChange={(e) => {
                      const u = catalogo.find((c) => c.id === e.target.value);
                      if (u && !responsables.some((r) => r.id === u.id)) onCambio({ responsables: [...responsables, u] });
                    }}>
                      <option value="">+ Otro responsable</option>
                      {catalogo.filter((c) => !responsables.some((r) => r.id === c.id)).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                  )}
                </span>
              </span>
            </div>
            <div className="est-opt dis" aria-disabled="true">
              <input type="radio" name="entrega" disabled checked={false} readOnly />
              <span className="est-ch-ic off"><IconMail size={18} /></span>
              <span style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
                <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><strong>Correo automático</strong><span className="est-chip off">En espera de IT</span></span>
                <span style={{ fontSize: 12.5, lineHeight: 1.5 }}>Se habilitará cuando IT active el envío de correo (SMTP o Microsoft Graph). La programación, los destinatarios y el mensaje ya quedan guardados: empezará a enviarse solo, sin rehacer nada.</span>
              </span>
            </div>
            <div className="est-opt dis" aria-disabled="true">
              <input type="radio" name="entrega" disabled checked={false} readOnly />
              <span className="est-ch-ic off"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /><path d="M8.5 11h7M8.5 14h4" /></svg></span>
              <span style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
                <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><strong>Microsoft Teams</strong><span className="est-chip nova">Próximamente</span></span>
                <span style={{ fontSize: 12.5, lineHeight: 1.5 }}>Publicará en el canal o chat que elijas una tarjeta con el resumen del informe y el botón &quot;Ver informe&quot;. Esta opción quedará habilitada próximamente.</span>
                <select disabled aria-label="Canal de Teams" style={{ opacity: .7 }}><option>Selecciona un canal…</option></select>
              </span>
            </div>
          </section>
        </div>
      )}

      {paso === 3 && (
        <div className="est-row">
          <section className="est-card est-grow" style={{ padding: "8px 24px" }} aria-labelledby="res-t">
            {activado && (
              <div className="est-verificada" style={{ margin: "16px 0 4px" }}>
                <IconCheck size={16} />
                <span><strong>Programación activa.</strong> {proximas[0] ? `La próxima edición se genera el ${new Date(proximas[0].fecha).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })} a las ${new Date(proximas[0].fecha).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}` : ""}{responsables.length ? ` y le llegará a ${responsables.map((r) => r.nombre).join(", ")} en Mi día.` : "."}</span>
              </div>
            )}
            <h2 id="res-t" style={{ padding: "16px 0 4px" }}>Así quedará</h2>
            <div className="est-resumen-row"><span className="k">Informe</span><span className="v"><strong>{informe.nombre}</strong><br /><span className="muted" style={{ fontSize: 12.5 }}>{(informe.bloques || []).length} secciones · <button type="button" className="est-fig" onClick={onVistaPrevia}>ver vista previa</button></span></span></div>
            <div className="est-resumen-row"><span className="k">Cuándo</span><span className="v">{descripcion}<br /><span className="muted" style={{ fontSize: 12.5 }}>{proximas[0] ? <>Próximo: <strong className="mono">{new Date(proximas[0].fecha).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "short", year: "numeric" })}</strong>{proximas[0].nota ? ` (${proximas[0].nota})` : ""}</> : "Sin fechas próximas"}</span></span><button type="button" className="btn small btn-ghost" onClick={() => setPaso(1)}>Cambiar</button></div>
            <div className="est-resumen-row"><span className="k">Período</span><span className="v">{PERIODOS.find((p) => p.value === informe.periodoGeneral)?.label || periodoCorto(informe.periodoGeneral)}</span><button type="button" className="btn small btn-ghost" onClick={() => setPaso(1)}>Cambiar</button></div>
            <div className="est-resumen-row"><span className="k">Para</span><span className="v">{(informe.destinatarios || []).join(", ") || <span style={{ color: "var(--critical)" }}>Sin destinatarios</span>}{informe.cc?.length ? <><br /><span className="muted" style={{ fontSize: 12.5 }}>CC: {informe.cc.join(", ")}</span></> : null}<br /><span className="muted" style={{ fontSize: 12.5 }}>Asunto: {informe.asunto}</span></span><button type="button" className="btn small btn-ghost" onClick={() => setPaso(2)}>Cambiar</button></div>
            <div className="est-resumen-row"><span className="k">Entrega</span><span className="v" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ display: "flex", gap: 8, alignItems: "center" }}><strong>Lo envío yo</strong><span className="est-chip ok">Activo</span></span>
              <span className="muted" style={{ fontSize: 12.5 }}>{avisoActivo ? "A su hora llega el aviso en Mi día con el PDF listo y el correo preparado." : "Aviso en Mi día desactivado: solo queda en el Historial de envíos."}</span>
              <span className="est-chips"><span className="est-chip off">Correo automático · en espera de IT</span><span className="est-chip off">Teams · próximamente</span></span>
            </span><button type="button" className="btn small btn-ghost" onClick={() => setPaso(2)}>Cambiar</button></div>
          </section>

          <aside className="est-side" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <section className="est-card" style={{ display: "flex", flexDirection: "column", gap: 12 }} aria-labelledby="prueba-t">
              <h2 id="prueba-t" style={{ fontSize: 15 }}>Haz una prueba antes</h2>
              <p className="est-sub" style={{ margin: 0 }}>Genera ahora el PDF y el aviso de &quot;Lo envío yo&quot; solo para ti, para ver exactamente lo que pasará en la próxima fecha.</p>
              <button type="button" className="btn" onClick={probar} disabled={probando}>{probando ? <><span className="spinner" /> Generando…</> : "Probar ahora conmigo"}</button>
            </section>
            <p className="muted" style={{ fontSize: 12.5, margin: 0, display: "flex", gap: 8 }}>
              <IconHistory size={14} /> Activar, pausar o cambiar la programación queda registrado en Auditoría con tu nombre y la hora.
            </p>
          </aside>
        </div>
      )}

      {error && <div className="modal-error"><IconAlert size={13} /> {error}</div>}

      {modoFoto && (
        <div className="est-foot">
          {fotosActivas
            ? <span className="est-chip ok">Fotos automáticas activas</span>
            : <span className="muted" style={{ fontSize: 12.5 }}>A cada fecha se guardará el informe tal como esté ese día en <strong>Fotos guardadas</strong>, sin usar IA.</span>}
          <div className="spacer" />
          {onVerFotos && <button type="button" className="btn" onClick={onVerFotos}>Ver fotos guardadas</button>}
          {fotosActivas && <button type="button" className="btn" onClick={() => onGuardar({ activo: false })} disabled={guardando}>Pausar fotos automáticas</button>}
          <button type="button" className="btn btn-primary" onClick={() => onGuardar({ esBorrador: false, activo: true }).then(() => setActivado(true)).catch((e) => setError(e.message))} disabled={guardando}>
            {guardando ? <span className="spinner" /> : <IconCheck size={14} />} {fotosActivas ? "Guardar cambios" : "Activar fotos automáticas"}
          </button>
        </div>
      )}

      {!modoFoto && <div className="est-foot">
        {paso > 1 && <button type="button" className="btn" onClick={() => setPaso(paso - 1)}>Atrás</button>}
        <div className="spacer" />
        {paso < 3 && <button type="button" className="btn btn-primary" onClick={() => setPaso(paso + 1)}>Siguiente: {paso === 1 ? "destinatarios" : "revisar"} →</button>}
        {paso === 3 && (
          <>
            {!informe.esBorrador && informe.activo && <button type="button" className="btn" onClick={() => onGuardar({ activo: false })} disabled={guardando}>Pausar programación</button>}
            {informe.esBorrador && <button type="button" className="btn" onClick={() => onGuardar({ esBorrador: true })} disabled={guardando}>Guardar sin activar</button>}
            <button type="button" className="btn btn-primary" onClick={activar} disabled={guardando}>
              {guardando ? <span className="spinner" /> : <IconCheck size={14} />} {!informe.esBorrador && informe.activo ? "Guardar cambios" : "Activar programación"}
            </button>
          </>
        )}
      </div>}

      {modoFoto && activado && proximas[0] && (
        <div className="est-verificada" role="status">
          <IconCheck size={16} />
          <span><strong>Fotos automáticas activas.</strong> La próxima se guarda el {new Date(proximas[0].fecha).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })} a las {new Date(proximas[0].fecha).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}.</span>
        </div>
      )}

      {prueba && <EnviarInformeModal edicionId={prueba} onClose={() => setPrueba(null)} />}
    </div>
  );
}
