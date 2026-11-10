"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  interpretarConNova, crearNotificacion, actualizarNotificacion, probarNotificacion, destinatariosElegibles, previsualizarProgramacion,
} from "@/lib/notificacionesApi";
import {
  LIMITES, FUENTES, CONSULTAS, PERIODOS, CAMPOS_FECHA, PRESETS_COMPRAS, PRESETS_PROVEEDORES, CONDICIONES, SI_FESTIVO, VARIABLES,
  EVENTOS, AGRUPACIONES, ESTADOS_CICLO, VARIABLES_EVENTO, NIVELES_PRESUPUESTO,
} from "@/lib/notificacionesCatalogo";
import { IconSpark, IconAlert, IconArrowRight, IconEdit } from "@/components/icons";
import { canViewRegistros, canViewAlertas, canViewProveedores, canViewPresupuesto, ROLE_LABELS } from "@/lib/roles";
import { iniciales, Portal } from "@/components/notificaciones/ui";

const EJEMPLOS = [
  "Todos los días, las compras que se vencen ese día",
  "Cada lunes, cuántas compras se registraron la semana anterior",
  "Cada día, las valoraciones de Nova de las compras radicadas ayer",
  "Cada lunes, los proveedores desactualizados",
  "Cada día hábil, mis pendientes",
];
const EJEMPLOS_EDICION = ["Que llegue a las 8:00 a. m.", "Que llegue también por Teams", "Solo si hay más de 5 resultados", "Que sea cada lunes", "Cámbiale el nombre a…"];
const FRECUENCIAS = { diaria: "Cada día hábil", semanal: "Cada semana", mensual: "Cada mes (día fijo)", mensual_semana: "Cada mes (p. ej. primer lunes)", ultimo_habil: "Último día hábil del mes", unica: "Una sola vez" };
const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const ORDINALES = { 1: "Primer", 2: "Segundo", 3: "Tercer", 4: "Cuarto", "-1": "Último" };

function fechaCorta(iso) {
  return new Date(iso).toLocaleString("es-CO", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

// Regla desde una notificación existente (modo edición).
function reglaDe(n) {
  if (!n) return null;
  const { disparador, evento, agrupacion, consulta, parametros, alcance, condicion, umbral, frecuencia, diaSemana, diaMes, ordinal, fechaUnica, hora, siFestivo, sabadoHabil, domingoHabil, nombre, titulo, plantilla, pedido } = n;
  return { disparador, evento, agrupacion, consulta, parametros, alcance, condicion, umbral, frecuencia, diaSemana, diaMes, ordinal, fechaUnica, hora, siFestivo, sabadoHabil, domingoHabil, nombre, titulo, plantilla, pedido };
}

export default function NotificacionModal({ user, notificacion, pedidoInicial = "", canales, onClose, onSaved }) {
  const editando = !!notificacion;
  // Al editar se empieza por el prompt ("¿Qué quieres cambiar?"), no por el formulario.
  const [paso, setPaso] = useState(editando ? "editar" : "pedido");
  const [instruccion, setInstruccion] = useState("");
  const [cambios, setCambios] = useState(null); // [{ campo, antes, despues }] que propone Nova
  const [manual, setManual] = useState(false); // nombre, mensaje, canales y regla técnica quedan en "Ajustar a mano"
  const [pedido, setPedido] = useState(notificacion?.pedido || pedidoInicial);
  const [turno, setTurno] = useState(1);
  const [respuestas, setRespuestas] = useState([]); // historial de respuestas (todas las rondas)
  const [ronda, setRonda] = useState({}); // respuestas de la ronda actual: id -> { valor, etiqueta }
  const [preguntas, setPreguntas] = useState([]);
  const [nova, setNova] = useState(null); // { estado, mensaje, resumen, puedeInformes }
  const [regla, setRegla] = useState(reglaDe(notificacion));
  const [canalesSel, setCanalesSel] = useState(notificacion?.canales || ["app"]);
  const [destinatarios, setDestinatarios] = useState(notificacion?.destinatarios?.map((d) => d.userId) || []);
  const [elegibles, setElegibles] = useState([]);
  const [agenda, setAgenda] = useState(notificacion ? { cuando: notificacion.cuando, proximas: notificacion.proximas } : null);
  const [tecnica, setTecnica] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const textareaRef = useRef(null);

  // Por evento, el "def" sale del catálogo de eventos: su fuente, sus filtros y sus variables.
  const esEvento = regla?.disparador === "evento";
  const evDef = esEvento ? EVENTOS[regla.evento] : null;
  const def = regla
    ? esEvento
      ? evDef && { fuente: evDef.fuente, label: evDef.label, parametros: evDef.filtros, alcances: evDef.fuente === "compras" ? ["general", "personal"] : ["general"], variables: VARIABLES_EVENTO }
      : CONSULTAS[regla.consulta]
    : null;
  const fuente = def?.fuente;

  useEffect(() => { if (paso === "pedido" || paso === "editar") textareaRef.current?.focus(); }, [paso]);

  // Destinatarios elegibles: solo quienes pueden ver los datos de esta fuente.
  useEffect(() => {
    if (!fuente) return;
    destinatariosElegibles(fuente).then((r) => {
      setElegibles(r.usuarios);
      setDestinatarios((prev) => {
        const validos = prev.filter((id) => r.usuarios.some((u) => u.id === id));
        if (validos.length || editando) return validos;
        return r.usuarios.some((u) => u.id === user.id) ? [user.id] : [];
      });
    }).catch(() => setElegibles([]));
  }, [fuente, editando, user.id]);

  // Vista previa de la programación cuando cambia algo de la agenda.
  const claveAgenda = regla ? JSON.stringify([regla.disparador, regla.evento, regla.agrupacion, regla.frecuencia, regla.diaSemana, regla.diaMes, regla.ordinal, regla.fechaUnica, regla.hora, regla.siFestivo, regla.sabadoHabil, regla.domingoHabil]) : "";
  useEffect(() => {
    if (esEvento) {
      const accion = evDef?.accion || "ocurre el evento";
      setAgenda({
        cuando: regla.agrupacion === "cada_15_min" ? `Cada 15 min, si ${accion}` : regla.agrupacion === "resumen_diario" ? `Resumen diario a las ${regla.hora || "—"}, si ${accion}` : `Al instante, cuando ${accion}`,
        proximas: [],
      });
      return;
    }
    if (!regla?.frecuencia) return;
    const t = setTimeout(() => previsualizarProgramacion(regla).then(setAgenda).catch(() => {}), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveAgenda]);

  async function interpretar(extra = []) {
    setCargando(true);
    setError("");
    try {
      const todas = [...respuestas, ...extra];
      const r = await interpretarConNova(editando
        ? { pedido, respuestas: todas, reglaParcial: regla, turno, modo: "editar", instruccion, destinatarios, destinatariosNombres: destinatarios.map(nombreDe), canales: canalesSel }
        : { pedido, respuestas: todas, reglaParcial: regla, turno });
      setRespuestas(todas);
      setTurno((t) => t + 1);
      setNova(r);
      setRonda({});
      if (r.regla) setRegla(r.regla);
      if (r.estado === "preguntas") { setPreguntas(r.preguntas); setPaso("preguntas"); }
      else if (r.estado === "lista") {
        setPreguntas([]);
        if (editando) {
          if (r.destinatarios) setDestinatarios(r.destinatarios.map((d) => d.userId));
          if (r.canales) setCanalesSel(r.canales);
          setCambios(r.cambios || []);
        }
        setPaso("confirmar");
      }
      else if (r.estado === "manual") { setPreguntas([]); setPaso("confirmar"); setTecnica(true); }
      else setPaso("aviso"); // no_permitido | es_informe | no_soportado
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }

  // Si el pedido ya viene escrito (cuadro rápido o ejemplo), Nova empieza de una vez.
  const arrancado = useRef(false);
  useEffect(() => {
    if (!editando && !arrancado.current && pedidoInicial.trim().length >= 8) { arrancado.current = true; interpretar(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function responder() {
    const nuevas = preguntas.filter((q) => ronda[q.id]).map((q) => ({ id: q.id, pregunta: q.texto, valor: ronda[q.id].valor, etiqueta: ronda[q.id].etiqueta }));
    if (nuevas.length < preguntas.length) { setError("Responde todas las preguntas para continuar."); return; }
    interpretar(nuevas);
  }

  const setR = (campo, valor) => setRegla((r) => ({ ...r, [campo]: valor }));
  const setP = (campo, valor) => setRegla((r) => ({ ...r, parametros: { ...(r.parametros || {}), [campo]: valor === "" ? undefined : valor } }));

  async function guardar(modo) {
    setError("");
    if (!destinatarios.length) { setError("Elige al menos un destinatario."); return; }
    setCargando(true);
    try {
      const body = {
        ...regla,
        pedido,
        aclaraciones: respuestas.map((r) => ({ pregunta: r.pregunta || r.id, respuesta: r.etiqueta || r.valor })),
        canales: canalesSel,
        destinatarios,
        // "Guardar y probar" en una nueva la deja como borrador: se prueba antes de activarla.
        // "guardar" (editar sin cambiar el estado): una pausada sigue pausada y un borrador sigue borrador.
        estado: modo === "activar" ? "activa" : modo === "borrador" ? "borrador" : editando && notificacion.estado !== "borrador" ? "activa" : "borrador",
        reanudar: modo === "activar",
      };
      const n = editando ? await actualizarNotificacion(notificacion.id, body) : await crearNotificacion(body);
      if (modo === "probar") {
        const p = await probarNotificacion(n.id);
        onSaved(`Guardada. ${p.mensaje || "Prueba enviada: revisa tu Bandeja."}`);
      } else {
        onSaved(modo === "borrador" ? "Guardada como borrador." : editando || modo === "guardar" ? "Cambios guardados." : "Notificación activa.");
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }

  const teamsDisponible = canales?.teams && canales.teams !== "desactivado";
  const elegiblesLibres = useMemo(() => elegibles.filter((u) => !destinatarios.includes(u.id)), [elegibles, destinatarios]);
  const nombreDe = (id) => (id === user.id ? "Yo" : elegibles.find((u) => u.id === id)?.nombre || notificacion?.destinatarios?.find((d) => d.userId === id)?.userNombre || id);
  const presets = fuente === "proveedores" ? PRESETS_PROVEEDORES : PRESETS_COMPRAS;
  // Mismas reglas que backend/lib/notificacionesPermisos.js (el servidor vuelve a validar al guardar).
  const permiso = (f, def) => user.permissions?.[f] ?? def;
  const fuentesVisibles = [
    canViewRegistros(user.role) && "compras",
    permiso("viewAlertas", canViewAlertas(user.role)) && "mi_dia",
    permiso("viewProveedores", canViewProveedores(user.role)) && "proveedores",
    permiso("viewPresupuesto", canViewPresupuesto(user.role)) && "presupuesto",
  ].filter(Boolean);

  // "¿A quién le llega?": lista visual de personas con acceso a la fuente (crear, editar y confirmar).
  const seccionPara = (
              <section className="nx-para">
                <div className="nx-para-head">
                  <div>
                    <p className="notif-label" style={{ margin: 0 }}>¿A quién le llega?</p>
                    <span className="count-note">Solo aparecen personas con acceso a {FUENTES[fuente]?.label || "estos datos"}. Le llega en la app{canalesSel.includes("teams") ? " y por Teams" : ""}.</span>
                  </div>
                  <span className={`nx-para-cuenta${destinatarios.length >= LIMITES.maxDestinatarios ? " lleno" : ""}`}>{destinatarios.length} de {LIMITES.maxDestinatarios}</span>
                </div>
                <ul className="nx-para-lista">
                  {elegibles.map((u) => {
                    const on = destinatarios.includes(u.id);
                    const bloqueado = !on && destinatarios.length >= LIMITES.maxDestinatarios;
                    return (
                      <li key={u.id} className={on ? "on" : ""}>
                        <label className={`nx-para-fila${bloqueado ? " bloqueado" : ""}`} title={bloqueado ? `Máximo ${LIMITES.maxDestinatarios} destinatarios` : ""}>
                          <span className="nx-avatar">{u.id === user.id ? "Yo" : iniciales(u.nombre)}</span>
                          <span className="nx-para-nombre"><strong>{u.id === user.id ? `${u.nombre} (yo)` : u.nombre}</strong><small>{ROLE_LABELS[u.role] || u.role}</small></span>
                          <input type="checkbox" role="switch" checked={on} disabled={bloqueado}
                            onChange={(e) => setDestinatarios((d) => (e.target.checked ? [...d, u.id] : d.filter((x) => x !== u.id)))}
                            aria-label={`${on ? "Quitar a" : "Agregar a"} ${u.nombre}`} />
                        </label>
                      </li>
                    );
                  })}
                  {elegibles.length === 0 && <li className="count-note" style={{ padding: 12 }}>Cargando personas…</li>}
                </ul>
              </section>
  );

  // "¿Por dónde le llega?" (canales.elegirCanal): la app siempre; Teams opcional si el servidor lo tiene configurado; correo deshabilitado.
  const seccionCanales = canales?.elegirCanal ? (
    <section className="nx-canales-sel">
      <div className="nx-para-head">
        <p className="notif-label" style={{ margin: 0 }}>¿Por dónde le llega?</p>
      </div>
      <div className="nx-canales-opciones">
        <label className="nx-canal-op on fija">
          <span className="nx-canal-op-txt"><strong>En la app</strong><small>Siempre: Bandeja y aviso en pantalla</small></span>
          <input type="checkbox" role="switch" checked disabled aria-label="En la app (siempre)" />
        </label>
        <label className={`nx-canal-op${canalesSel.includes("teams") ? " on" : ""}${teamsDisponible ? "" : " apagada"}`}>
          <span className="nx-canal-op-txt"><strong>Teams</strong><small>{!teamsDisponible ? "Sin configurar en el servidor" : canales.teams === "simulado" ? "Modo simulado (no se envía)" : canales.teamsDestinoPrueba ? (canales.local ? "Chat del bot · en local te llega a ti" : "Atención: todo se redirige a un correo de prueba (TEAMS_DESTINO_PRUEBA)") : "Chat privado del bot a cada persona"}</small></span>
          <input type="checkbox" role="switch" checked={canalesSel.includes("teams")} disabled={!teamsDisponible}
            onChange={(e) => setCanalesSel(e.target.checked ? ["app", "teams"] : ["app"])} aria-label="Enviar también por Teams" />
        </label>
        <label className="nx-canal-op apagada" title="El correo saliente está bloqueado por ahora">
          <span className="nx-canal-op-txt"><strong>Correo</strong><small>Próximamente</small></span>
          <input type="checkbox" role="switch" checked={false} disabled aria-label="Correo (deshabilitado)" />
        </label>
      </div>
    </section>
  ) : null;

  return (
    <Portal>
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal notif-modal-ancho" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={editando ? "Editar notificación" : "Nueva notificación"}>
        <div className="modal-head">
          {editando && regla ? (
            // El nombre se edita aquí mismo; se guarda con "Guardar cambios" o al confirmar lo que propone Nova.
            <label className="nx-titulo-edit" title="Haz clic para cambiar el nombre">
              <span className="nx-titulo-pre">Editar ·</span>
              <input value={regla.nombre || ""} maxLength={120} onChange={(e) => setR("nombre", e.target.value)} aria-label="Nombre de la notificación" />
              <IconEdit size={14} />
            </label>
          ) : (
            <h3>Nueva notificación</h3>
          )}
          <button type="button" className="btn btn-ghost" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>

        {!editando && (
          <ol className="notif-pasos" aria-label="Pasos">
            {[["pedido", "Tu pedido"], ["preguntas", "Preguntas de Nova"], ["confirmar", "Confirmar"]].map(([k, l], i) => (
              <li key={k} className={paso === k || (paso === "aviso" && k === "pedido") ? "on" : ""}><span>{i + 1}</span>{l}</li>
            ))}
          </ol>
        )}

        <div className="notif-modal-body">
          {paso === "pedido" && (
            <>
              <label className="notif-label" htmlFor="notif-pedido">¿Qué quieres que te avise?</label>
              <textarea id="notif-pedido" ref={textareaRef} rows={4} value={pedido} onChange={(e) => setPedido(e.target.value)} maxLength={1000}
                placeholder="Ej.: Quiero que cada lunes me digas cuántas compras se registraron la semana anterior" />
              <div className="notif-ejemplos">
                <span className="count-note">Ejemplos:</span>
                {EJEMPLOS.map((e) => <button key={e} type="button" className="pill-btn" onClick={() => setPedido(e)}>{e}</button>)}
              </div>
              <p className="count-note">Nova te preguntará lo que no quede claro (la hora, qué hacer si es festivo, si se envía cuando no hay resultados…). Solo puedes usar datos que tu rol ya ve.</p>
            </>
          )}

          {paso === "editar" && (
            <>
              <div className="notif-resumen">
                <p className="notif-label" style={{ marginTop: 0 }}>Así está hoy</p>
                <p style={{ margin: 0 }}><strong>{agenda?.cuando || notificacion.cuando}</strong> · {def?.label}</p>
                <p className="count-note" style={{ margin: "6px 0 0" }}>
                  Para: {destinatarios.map(nombreDe).join(", ") || "nadie"} · Llega por: {canalesSel.map((c) => (c === "app" ? "App" : c === "teams" ? "Teams" : "Correo")).join(" · ")}
                </p>
              </div>
              <label className="notif-label" htmlFor="notif-instruccion">¿Qué quieres cambiar?</label>
              <textarea id="notif-instruccion" ref={textareaRef} rows={3} value={instruccion} onChange={(e) => setInstruccion(e.target.value)} maxLength={1000}
                placeholder="Ej.: que llegue a las 8 de la mañana y solo si hay más de 5 compras"
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && instruccion.trim().length >= 3) { e.preventDefault(); interpretar(); } }} />
              <div className="notif-ejemplos">
                <span className="count-note">Ejemplos:</span>
                {EJEMPLOS_EDICION.map((e) => <button key={e} type="button" className="pill-btn" onClick={() => setInstruccion(e)}>{e}</button>)}
              </div>
              <p className="count-note">Nova cambia solo lo que pidas (qué, cuándo, filtros, mensaje) y te muestra los cambios antes de guardar. Las personas se eligen abajo.</p>
              {seccionPara}
              {seccionCanales}
            </>
          )}

          {paso === "preguntas" && (
            <>
              <div className="notif-nova">
                <IconSpark size={15} />
                <div>
                  {nova?.resumen && <p style={{ margin: 0 }}><strong>Entendí:</strong> {nova.resumen}</p>}
                  {nova?.mensaje && <p style={{ margin: nova?.resumen ? "6px 0 0" : 0 }}>{nova.mensaje}</p>}
                  {!nova?.resumen && !nova?.mensaje && <p style={{ margin: 0 }}>Necesito aclarar un par de cosas:</p>}
                </div>
              </div>
              {preguntas.map((q) => (
                <div key={q.id} className="notif-pregunta">
                  <p className="notif-label">{q.texto}</p>
                  <div className="pill-group">
                    {q.opciones.map((o) => (
                      <button key={o.valor} type="button" className={`pill-btn${ronda[q.id]?.valor === o.valor ? " active" : ""}`} onClick={() => setRonda((r) => ({ ...r, [q.id]: o }))}>
                        {o.etiqueta}
                      </button>
                    ))}
                    {q.permiteTexto && (
                      <input type={q.id === "hora" ? "time" : "text"} className="notif-otra" placeholder="Otra…" aria-label={`${q.texto} (otra respuesta)`}
                        value={ronda[q.id]?.libre ? ronda[q.id].valor : ""}
                        onChange={(e) => setRonda((r) => ({ ...r, [q.id]: e.target.value ? { valor: e.target.value, etiqueta: e.target.value, libre: true } : undefined }))} />
                    )}
                  </div>
                </div>
              ))}
            </>
          )}

          {paso === "aviso" && nova && (
            <div className={`notif-aviso ${nova.estado === "no_permitido" ? "critico" : ""}`}>
              <IconAlert size={18} />
              <div>
                <p style={{ margin: 0 }}>{nova.mensaje}</p>
                {nova.estado === "es_informe" && nova.puedeInformes && <p style={{ margin: "8px 0 0" }}><Link href="/informes" className="btn small btn-primary">Ir a Estudio de informes <IconArrowRight size={12} /></Link></p>}
                {nova.estado === "es_informe" && !nova.puedeInformes && <p className="count-note" style={{ margin: "8px 0 0" }}>Los informes los configura un administrador: pídeselo.</p>}
              </div>
            </div>
          )}

          {paso === "confirmar" && regla && (
            <>
              {editando && cambios && (
                <div className="notif-cambios">
                  <p className="notif-label" style={{ marginTop: 0 }}>{cambios.length ? "Cambios que hará Nova" : "Nova no encontró nada que cambiar"}</p>
                  {cambios.length > 0 && (
                    <ul>
                      {cambios.map((c) => (
                        <li key={c.campo}><strong>{c.campo}:</strong> <span className="notif-antes">{c.antes}</span> <span aria-hidden="true">→</span> <span className="notif-despues">{c.despues}</span></li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              <div className="notif-resumen">
                <p className="notif-label" style={{ marginTop: 0 }}>Así quedará</p>
                {nova?.resumen && <p style={{ margin: "0 0 6px" }}>{nova.resumen}</p>}
                <p style={{ margin: 0 }}><strong>{agenda?.cuando || "Sin programar"}</strong> · {def?.label}{esEvento ? "" : ` · ${CONDICIONES[regla.condicion] || ""}`}{regla.alcance === "personal" ? " · cada quien recibe lo suyo" : ""}</p>
                {agenda?.proximas?.length > 0 && <p className="count-note" style={{ margin: "6px 0 0" }}>Próximos envíos: {agenda.proximas.map((p) => fechaCorta(p.fecha)).join(" · ")}</p>}
                {nova?.mensaje && nova.estado !== "lista" && <p className="count-note" style={{ margin: "6px 0 0" }}>{nova.mensaje}</p>}
              </div>

              {seccionPara}
              {seccionCanales}

              <button type="button" className="btn btn-ghost notif-tecnica-btn" onClick={() => setManual((m) => !m)} aria-expanded={manual}>
                {manual ? "▾" : "▸"} Ajustar a mano (nombre, mensaje y regla)
              </button>
              {manual && (<>
              <div className="notif-form">
                <div className="field full">
                  <label htmlFor="n-nombre">Nombre</label>
                  <input id="n-nombre" value={regla.nombre || ""} maxLength={120} onChange={(e) => setR("nombre", e.target.value)} />
                </div>
                <div className="field full">
                  <label htmlFor="n-titulo">Título</label>
                  <input id="n-titulo" value={regla.titulo || ""} maxLength={150} onChange={(e) => setR("titulo", e.target.value)} />
                </div>
                <div className="field full">
                  <label htmlFor="n-plantilla">Mensaje</label>
                  <textarea id="n-plantilla" rows={3} value={regla.plantilla || ""} maxLength={1500} onChange={(e) => setR("plantilla", e.target.value)} />
                  <span className="count-note">Variables: {(def?.variables || []).map((v) => <code key={v} title={VARIABLES[v]} className="notif-var">{`{${v}}`}</code>)} · la lista de resultados se agrega sola debajo.</span>
                </div>

              </div>

              <button type="button" className="btn btn-ghost notif-tecnica-btn" onClick={() => setTecnica((t) => !t)} aria-expanded={tecnica}>
                {tecnica ? "▾" : "▸"} Ver la regla técnica (editable)
              </button>
              {tecnica && (
                <div className="notif-form notif-tecnica">
                  <div className="field">
                    <label htmlFor="n-tipo">Tipo</label>
                    <select id="n-tipo" value={esEvento ? "evento" : "programado"} onChange={(e) => setRegla((r) => (e.target.value === "evento"
                      ? { ...r, disparador: "evento", evento: Object.keys(EVENTOS).find((k) => fuentesVisibles.includes(EVENTOS[k].fuente)), agrupacion: "inmediato", parametros: {}, frecuencia: null, siFestivo: null, condicion: "si_hay_resultados", hora: null }
                      : { ...r, disparador: "programado", evento: null, agrupacion: null, consulta: Object.keys(CONSULTAS).find((k) => fuentesVisibles.includes(CONSULTAS[k].fuente)), parametros: {} }))}>
                      <option value="programado">Programada (a una hora)</option>
                      <option value="evento">Por evento (cuando pase algo)</option>
                    </select>
                  </div>
                  {esEvento && (
                    <>
                      <div className="field">
                        <label htmlFor="n-evento">Cuando</label>
                        <select id="n-evento" value={regla.evento || ""} onChange={(e) => setRegla((r) => ({ ...r, evento: e.target.value, parametros: {}, alcance: EVENTOS[e.target.value].fuente === "compras" ? r.alcance : "general" }))}>
                          {Object.entries(EVENTOS).filter(([, ev]) => fuentesVisibles.includes(ev.fuente)).map(([k, ev]) => <option key={k} value={k}>{ev.label}</option>)}
                        </select>
                      </div>
                      <div className="field">
                        <label htmlFor="n-agrup">Cómo te llegan</label>
                        <select id="n-agrup" value={regla.agrupacion || ""} onChange={(e) => setR("agrupacion", e.target.value)}>
                          <option value="">Elige…</option>
                          {Object.entries(AGRUPACIONES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                      </div>
                      {regla.agrupacion === "resumen_diario" && (
                        <div className="field"><label htmlFor="n-hora-ev">Hora del resumen</label><input id="n-hora-ev" type="time" value={regla.hora || ""} onChange={(e) => setR("hora", e.target.value)} /></div>
                      )}
                      {def?.parametros.includes("area") && (
                        <div className="field"><label htmlFor="n-ev-area">Área (opcional)</label><input id="n-ev-area" value={regla.parametros?.area || ""} maxLength={100} onChange={(e) => setP("area", e.target.value)} placeholder="Todas" /></div>
                      )}
                      {def?.parametros.includes("proveedor") && (
                        <div className="field"><label htmlFor="n-ev-prov">Solo de un proveedor (NIT o nombre, opcional)</label><input id="n-ev-prov" value={regla.parametros?.proveedor || ""} maxLength={100} onChange={(e) => setP("proveedor", e.target.value)} placeholder="Todos" /></div>
                      )}
                      {def?.parametros.includes("nivel") && (
                        <div className="field">
                          <label htmlFor="n-ev-nivel">Qué presupuesto</label>
                          <select id="n-ev-nivel" value={regla.parametros?.nivel || ""} onChange={(e) => setP("nivel", e.target.value)}>
                            <option value="">Cualquiera (general, área o categoría)</option>
                            {Object.entries(NIVELES_PRESUPUESTO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                          </select>
                        </div>
                      )}
                      {def?.parametros.includes("soloExcedido") && (
                        <div className="field">
                          <label>Cuándo</label>
                          <label className="check-row"><input type="checkbox" checked={!!regla.parametros?.soloExcedido} onChange={(e) => setP("soloExcedido", e.target.checked || "")} /> <span>Solo cuando se excede (100 %), no al 80 %</span></label>
                        </div>
                      )}
                      {def?.parametros.includes("puntajeMax") && (
                        <div className="field">
                          <label htmlFor="n-ev-puntaje">Solo si el puntaje es ≤ (opcional)</label>
                          <select id="n-ev-puntaje" value={regla.parametros?.puntajeMax || ""} onChange={(e) => setP("puntajeMax", e.target.value ? Number(e.target.value) : "")}>
                            <option value="">Todas</option>
                            {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
                          </select>
                        </div>
                      )}
                      {def?.parametros.includes("estrellasMax") && (
                        <div className="field">
                          <label htmlFor="n-ev-estrellas">Solo si las estrellas son ≤ (opcional)</label>
                          <select id="n-ev-estrellas" value={regla.parametros?.estrellasMax || ""} onChange={(e) => setP("estrellasMax", e.target.value ? Number(e.target.value) : "")}>
                            <option value="">Todas</option>
                            {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}★</option>)}
                          </select>
                        </div>
                      )}
                      {def?.parametros.includes("estadoCiclo") && (
                        <div className="field">
                          <label htmlFor="n-ev-ciclo">Solo cuando pase a (opcional)</label>
                          <select id="n-ev-ciclo" value={regla.parametros?.estadoCiclo || ""} onChange={(e) => setP("estadoCiclo", e.target.value)}>
                            <option value="">Cualquier estado</option>
                            {Object.entries(ESTADOS_CICLO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                          </select>
                        </div>
                      )}
                      {def?.parametros.includes("soloFueraDePlazo") && (
                        <div className="field">
                          <label>Filtro</label>
                          <label className="check-row"><input type="checkbox" checked={!!regla.parametros?.soloFueraDePlazo} onChange={(e) => setP("soloFueraDePlazo", e.target.checked || "")} /> <span>Solo las entregadas fuera de plazo</span></label>
                        </div>
                      )}
                      {def?.alcances.length > 1 && (
                        <div className="field">
                          <label htmlFor="n-ev-alcance">De qué compras</label>
                          <select id="n-ev-alcance" value={regla.alcance || ""} onChange={(e) => setR("alcance", e.target.value)}>
                            <option value="">Elige…</option>
                            <option value="general">De todas</option>
                            <option value="personal">Solo las de cada quien</option>
                          </select>
                        </div>
                      )}
                    </>
                  )}
                  {!esEvento && (<>
                  <div className="field">
                    <label htmlFor="n-consulta">Datos</label>
                    <select id="n-consulta" value={regla.consulta} onChange={(e) => setRegla((r) => ({ ...r, consulta: e.target.value, parametros: {}, alcance: CONSULTAS[e.target.value].alcances[0] }))}>
                      {Object.entries(CONSULTAS).filter(([, c]) => fuentesVisibles.includes(c.fuente)).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}
                    </select>
                  </div>
                  {def?.parametros.includes("preset") && (
                    <div className="field">
                      <label htmlFor="n-preset">Situación</label>
                      <select id="n-preset" value={regla.parametros?.preset || ""} onChange={(e) => setP("preset", e.target.value)}>
                        <option value="">Elige…</option>
                        {Object.entries(presets).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </div>
                  )}
                  {def?.parametros.includes("periodo") && (def.usaPeriodo || regla.parametros?.preset === "registradas") && (
                    <div className="field">
                      <label htmlFor="n-periodo">Período</label>
                      <select id="n-periodo" value={regla.parametros?.periodo || ""} onChange={(e) => setP("periodo", e.target.value)}>
                        <option value="">Por defecto</option>
                        {Object.entries(PERIODOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </div>
                  )}
                  {regla.parametros?.periodo === "ultimos_n_dias" && (
                    <div className="field"><label htmlFor="n-dias">Días</label><input id="n-dias" type="number" min={1} max={366} value={regla.parametros?.dias || 7} onChange={(e) => setP("dias", Number(e.target.value))} /></div>
                  )}
                  {def?.parametros.includes("campoFecha") && (def.usaCampoFecha || regla.parametros?.preset === "registradas") && (
                    <div className="field">
                      <label htmlFor="n-campo">Contar por</label>
                      <select id="n-campo" value={regla.parametros?.campoFecha || ""} onChange={(e) => setP("campoFecha", e.target.value)}>
                        <option value="">Elige…</option>
                        {Object.entries(CAMPOS_FECHA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </div>
                  )}
                  {["area", "categoria", "estado"].filter((p) => def?.parametros.includes(p)).map((p) => (
                    <div className="field" key={p}>
                      <label htmlFor={`n-${p}`}>{p === "area" ? "Área" : p === "categoria" ? "Categoría" : "Estado"} (opcional)</label>
                      <input id={`n-${p}`} value={regla.parametros?.[p] || ""} maxLength={100} onChange={(e) => setP(p, e.target.value)} placeholder="Todas" />
                    </div>
                  ))}
                  {def?.parametros.includes("puntajeMax") && (
                    <div className="field">
                      <label htmlFor="n-puntaje">Solo puntaje ≤ (opcional)</label>
                      <select id="n-puntaje" value={regla.parametros?.puntajeMax || ""} onChange={(e) => setP("puntajeMax", e.target.value ? Number(e.target.value) : "")}>
                        <option value="">Todas</option>
                        {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                  )}
                  {def?.parametros.includes("umbral") && (
                    <div className="field"><label htmlFor="n-pumbral">% del presupuesto</label><input id="n-pumbral" type="number" min={1} max={500} value={regla.parametros?.umbral || 80} onChange={(e) => setP("umbral", Number(e.target.value))} /></div>
                  )}
                  {def?.alcances.length > 1 && (
                    <div className="field">
                      <label htmlFor="n-alcance">Alcance</label>
                      <select id="n-alcance" value={regla.alcance || ""} onChange={(e) => setR("alcance", e.target.value)}>
                        <option value="">Elige…</option>
                        <option value="general">Lo de todos</option>
                        <option value="personal">Solo lo de cada quien</option>
                      </select>
                    </div>
                  )}
                  <div className="field">
                    <label htmlFor="n-frec">Frecuencia</label>
                    <select id="n-frec" value={regla.frecuencia || ""} onChange={(e) => setR("frecuencia", e.target.value)}>
                      <option value="">Elige…</option>
                      {Object.entries(FRECUENCIAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  {["semanal", "mensual_semana"].includes(regla.frecuencia) && (
                    <div className="field">
                      <label htmlFor="n-dsem">Día</label>
                      <select id="n-dsem" value={regla.diaSemana ?? 1} onChange={(e) => setR("diaSemana", Number(e.target.value))}>
                        {DIAS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                      </select>
                    </div>
                  )}
                  {regla.frecuencia === "mensual_semana" && (
                    <div className="field">
                      <label htmlFor="n-ord">Cuál</label>
                      <select id="n-ord" value={regla.ordinal ?? 1} onChange={(e) => setR("ordinal", Number(e.target.value))}>
                        {Object.entries(ORDINALES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </div>
                  )}
                  {regla.frecuencia === "mensual" && (
                    <div className="field"><label htmlFor="n-dmes">Día del mes (31 = fin de mes)</label><input id="n-dmes" type="number" min={1} max={31} value={regla.diaMes ?? 1} onChange={(e) => setR("diaMes", Number(e.target.value))} /></div>
                  )}
                  {regla.frecuencia === "unica" && (
                    <div className="field"><label htmlFor="n-funica">Fecha</label><input id="n-funica" type="date" value={regla.fechaUnica || ""} onChange={(e) => setR("fechaUnica", e.target.value)} /></div>
                  )}
                  <div className="field"><label htmlFor="n-hora">Hora</label><input id="n-hora" type="time" value={regla.hora || ""} onChange={(e) => setR("hora", e.target.value)} /></div>
                  {regla.frecuencia && regla.frecuencia !== "diaria" && regla.frecuencia !== "ultimo_habil" && (
                    <div className="field">
                      <label htmlFor="n-fest">Si es festivo</label>
                      <select id="n-fest" value={regla.siFestivo || ""} onChange={(e) => setR("siFestivo", e.target.value)}>
                        <option value="">Elige…</option>
                        {Object.entries(SI_FESTIVO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </div>
                  )}
                  <div className="field">
                    <label htmlFor="n-cond">Cuándo se envía</label>
                    <select id="n-cond" value={regla.condicion || ""} onChange={(e) => setR("condicion", e.target.value)}>
                      <option value="">Elige…</option>
                      {Object.entries(CONDICIONES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  {regla.condicion === "umbral" && (
                    <div className="field"><label htmlFor="n-umbral">Mínimo de resultados</label><input id="n-umbral" type="number" min={1} value={regla.umbral || 1} onChange={(e) => setR("umbral", Number(e.target.value))} /></div>
                  )}
                  </>)}
                </div>
              )}
              </>)}
            </>
          )}
          {error && <p className="modal-error">{error}</p>}
        </div>

        <div className="modal-foot">
          {paso === "pedido" && (
            <>
              <div className="spacer" />
              <button type="button" className="btn btn-nova" disabled={cargando || pedido.trim().length < 8} onClick={() => interpretar()}>
                {cargando ? <span className="spinner" /> : <IconSpark size={13} />} Continuar
              </button>
            </>
          )}
          {paso === "editar" && (
            <>
              <button type="button" className="btn" onClick={() => { setManual(true); setCambios(null); setPaso("confirmar"); }} disabled={cargando}>Ajustar a mano</button>
              <div className="spacer" />
              <button type="button" className="btn" disabled={cargando || instruccion.trim().length > 0} onClick={() => guardar("guardar")} title={instruccion.trim() ? "Primero aplica lo que escribiste con Nova" : "Guarda los cambios de personas"}>
                Guardar cambios
              </button>
              <button type="button" className="btn btn-nova" disabled={cargando || instruccion.trim().length < 3} onClick={() => interpretar()}>
                {cargando ? <span className="spinner" /> : <IconSpark size={13} />} Aplicar con Nova
              </button>
            </>
          )}
          {paso === "preguntas" && (
            <>
              <button type="button" className="btn" onClick={() => setPaso(editando ? "editar" : "pedido")} disabled={cargando}>{editando ? "← Cambiar lo que pedí" : "← Cambiar el pedido"}</button>
              <div className="spacer" />
              <button type="button" className="btn btn-nova" disabled={cargando} onClick={responder}>
                {cargando ? <span className="spinner" /> : null} Listo
              </button>
            </>
          )}
          {paso === "aviso" && (
            <>
              <div className="spacer" />
              <button type="button" className="btn" onClick={() => { setPaso("pedido"); setRegla(null); setRespuestas([]); setTurno(1); }}>Escribir otro pedido</button>
            </>
          )}
          {paso === "confirmar" && (
            <>
              {!editando && <button type="button" className="btn" onClick={() => setPaso("pedido")} disabled={cargando}>← Cambiar el pedido</button>}
              {editando && <button type="button" className="btn" onClick={() => { setInstruccion(""); setPaso("editar"); }} disabled={cargando}>← Pedir otro cambio</button>}
              <div className="spacer" />
              <button type="button" className="btn" disabled={cargando} onClick={() => guardar("borrador")}>Guardar como borrador</button>
              {/* Por evento sale solo cuando ocurre el hecho: no hay prueba manual. */}
              {!esEvento && <button type="button" className="btn" disabled={cargando} onClick={() => guardar("probar")} title="Guarda y envía una prueba a todos los destinatarios (marcada como PRUEBA)">Guardar y probar</button>}
              <button type="button" className="btn btn-primary" disabled={cargando} onClick={() => guardar("activar")}>
                {cargando ? <span className="spinner" /> : null} {editando && notificacion.estado === "activa" ? "Guardar" : "Activar"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
    </Portal>
  );
}
