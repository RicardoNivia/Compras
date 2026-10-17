"use client";

import { useCallback, useEffect, useState } from "react";
import {
  listarNotificaciones, cambiarEstadoNotificacion, eliminarNotificacion, probarNotificacion, enviarAhoraNotificacion,
  cambiarSuscripcion, estadoCanales,
} from "@/lib/notificacionesApi";
import { CANALES, ESTADOS, RESULTADOS, LIMITES, FUENTES } from "@/lib/notificacionesCatalogo";
import NotificacionModal from "@/components/notificaciones/NotificacionModal";
import HistorialModal from "@/components/notificaciones/HistorialModal";
import ConfirmarModal from "@/components/notificaciones/ConfirmarModal";
import { EVENTO_REVISAR } from "@/components/notificaciones/AvisosEnVivo";
import { FuenteIcono, Avatares, haceCuanto, Cuando, Paginacion } from "@/components/notificaciones/ui";
import { IconPlus, IconSend, IconHistory, IconEdit, IconTrash, IconEye, IconSpark, IconArrowRight, IconAlert } from "@/components/icons";

const PAGE_SIZES = [25, 50, 100];
const EJEMPLOS = [
  "Todos los días, las compras que se vencen ese día",
  "Cada lunes, cuántas compras se registraron la semana anterior",
  "Cada día, las valoraciones de Nova de ayer",
];
const VER = [["mias", "Mías"], ["recibo", "Me llegan de otros"], ["todas", "Todas"]];

function proximo(n) {
  const p = n.proximas?.[0];
  return p ? new Date(p.fecha).toLocaleString("es-CO", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null;
}

// "Mis notificaciones": tarjetas con las que configuro (o, para admin, las de todos) y las de otros que me llegan.
export default function NotificacionesView({ user }) {
  const esAdmin = user.role === "admin";
  const [ver, setVer] = useState("mias");
  const [estado, setEstado] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(PAGE_SIZES[0]);
  const [data, setData] = useState({ notificaciones: [], total: 0, resumen: null });
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState(null);
  const [modal, setModal] = useState(undefined); // undefined = cerrado; { pedido } = nueva; objeto con id = editar
  const [historial, setHistorial] = useState(null);
  const [canales, setCanales] = useState(null);
  const [confirmar, setConfirmar] = useState(null);
  const [pedidoRapido, setPedidoRapido] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await listarNotificaciones({ ver, estado, q: q.trim(), page, size });
      setData(r);
      if (r.page !== page) setPage(r.page);
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, [ver, estado, q, page, size]);

  useEffect(() => { const t = setTimeout(cargar, 200); return () => clearTimeout(t); }, [cargar]);
  useEffect(() => { setPage(1); }, [ver, estado, q, size]);
  useEffect(() => { estadoCanales().then(setCanales).catch(() => {}); }, []);
  useEffect(() => { if (!aviso) return; const t = setTimeout(() => setAviso(""), 4500); return () => clearTimeout(t); }, [aviso]);

  async function accion(n, fn, okMsg, revisarAvisos = false) {
    setOcupado(n.id);
    setError("");
    try {
      const r = await fn();
      setAviso(r?.mensaje || okMsg);
      if (revisarAvisos) window.dispatchEvent(new Event(EVENTO_REVISAR));
      await cargar();
    } catch (e) {
      setError(e.message);
    } finally {
      setOcupado(null);
    }
  }

  const activos = (n) => n.destinatarios.filter((d) => !d.deBaja).length;

  const enviarAhora = (n) => setConfirmar({
    titulo: "Enviar ahora",
    mensaje: `¿Enviar "${n.nombre}" ahora a ${activos(n)} persona(s), con los datos de este momento?`,
    detalle: "Quedará en el historial como envío manual a tu nombre y el mensaje dirá que fue enviada manualmente. El envío programado de hoy sigue igual.",
    boton: "Enviar ahora",
    onOk: () => accion(n, () => enviarAhoraNotificacion(n.id), "Enviada.", true),
  });
  const eliminar = (n) => setConfirmar({
    titulo: "Eliminar notificación",
    mensaje: `¿Eliminar "${n.nombre}"?`,
    detalle: "Se borra también su historial de envíos. Queda registrado en auditoría.",
    boton: "Eliminar",
    peligro: true,
    onOk: () => accion(n, () => eliminarNotificacion(n.id), "Notificación eliminada."),
  });
  const dejarDeRecibir = (n) => setConfirmar({
    titulo: "Dejar de recibir",
    mensaje: `¿Dejar de recibir "${n.nombre}"?`,
    detalle: `${n.propietarioNombre} verá que te diste de baja. Puedes volver a recibirla cuando quieras.`,
    boton: "Dejar de recibir",
    onOk: () => accion(n, () => cambiarSuscripcion(n.id, "baja"), "Ya no la recibirás."),
  });
  const alternarActiva = (n) => {
    const pausar = n.estado === "activa";
    accion(n, () => cambiarEstadoNotificacion(n.id, pausar ? "pausar" : "reanudar"), pausar ? "Notificación pausada." : "Notificación activa.");
  };

  const r = data.resumen || { activas: 0, pausadas: 0, borradores: 0, enviadasHoy: 0, deOtros: 0 };
  const pct = Math.min(100, Math.round((r.activas / LIMITES.maxActivasPorPersona) * 100));
  const nueva = (pedido = "") => setModal({ pedido });

  return (
    <div className="nx-vista">
      {/* Encabezado con indicadores y pedido rápido */}
      <section className="nx-hero">
        <div className="nx-hero-texto">
          <span className="nx-hero-kicker"><IconSpark size={13} /> Notificaciones con Nova</span>
          <h2>¿Qué quieres que te avise?</h2>
          <p>Escríbelo como se lo dirías a alguien. Nova te pregunta lo que no esté claro y te avisa en la app y en Teams.</p>
          <form className="nx-hero-pedido" onSubmit={(e) => { e.preventDefault(); nueva(pedidoRapido); }}>
            <input value={pedidoRapido} onChange={(e) => setPedidoRapido(e.target.value)} placeholder="Ej.: cada lunes, cuántas compras se registraron la semana anterior" aria-label="Pedido para Nova" />
            <button type="submit" className="btn nx-hero-btn"><IconSpark size={14} /> Crear con Nova</button>
          </form>
          <div className="nx-hero-ejemplos">
            {EJEMPLOS.map((e) => <button key={e} type="button" onClick={() => nueva(e)}>{e}</button>)}
          </div>
        </div>
        <div className="nx-hero-kpis">
          <div className="nx-kpi nx-kpi-principal">
            <div className="nx-anillo" style={{ "--pct": pct }}><span>{r.activas}<small>/{LIMITES.maxActivasPorPersona}</small></span></div>
            <div><strong>Activas</strong><small>{LIMITES.maxActivasPorPersona - r.activas > 0 ? `Puedes activar ${LIMITES.maxActivasPorPersona - r.activas} más` : "Llegaste al máximo"}</small></div>
          </div>
          <div className="nx-kpi"><strong>{r.enviadasHoy}</strong><small>Enviadas hoy</small></div>
          <div className="nx-kpi"><strong>{r.pausadas}</strong><small>Pausadas</small></div>
          <div className="nx-kpi"><strong>{r.deOtros}</strong><small>Te llegan de otros</small></div>
        </div>
      </section>

      {canales && (canales.teams !== "real" || canales.teamsDestinoPrueba) && (
        <div className="nx-banda">
          <IconAlert size={14} />
          <span>
            {canales.teams === "simulado" ? "Teams está en modo simulado: las tarjetas se arman pero no se envían." : canales.teams === "desactivado" ? "Teams aún no está configurado: por ahora las notificaciones llegan solo a la app." : ""}
            {canales.teamsDestinoPrueba ? " Entorno local: todo envío a Teams se redirige al correo de prueba." : ""} El correo está deshabilitado.
          </span>
        </div>
      )}

      {/* Filtros */}
      <div className="nx-filtros">
        <div className="nx-segmento" role="tablist" aria-label="Ver">
          {VER.filter(([k]) => k !== "todas" || esAdmin).map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={ver === k} onClick={() => setVer(k)}>{l}{k === "recibo" && r.deOtros ? <span className="nx-num">{r.deOtros}</span> : null}</button>
          ))}
        </div>
        <div className="nx-chips">
          {[["", "Todas"], ...Object.entries(ESTADOS)].map(([k, l]) => (
            <button key={k || "todas"} type="button" className={`nx-chip${estado === k ? " on" : ""}`} onClick={() => setEstado(k)}>{l}</button>
          ))}
        </div>
        <div className="spacer" />
        <input type="search" className="nx-buscar" placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar notificaciones" />
      </div>
      {error && <p className="modal-error">{error}</p>}

      {/* Tarjetas */}
      <div className="nx-grid">
        {data.notificaciones.map((n) => {
          const personas = n.destinatarios.map((d) => ({ nombre: d.userNombre, yo: d.userId === user.id, apagado: d.deBaja }));
          const activa = n.estado === "activa";
          return (
            <article key={n.id} className={`nx-card estado-${n.estado}${ocupado === n.id ? " ocupada" : ""}`}>
              <header className="nx-card-head">
                <FuenteIcono fuente={n.fuente} />
                <div className="nx-card-titulo">
                  <h3 title={n.nombre}>{n.nombre}</h3>
                  <span>{FUENTES[n.fuente]?.label} · {n.consultaLabel}</span>
                </div>
                {n.puedeGestionar && ver !== "recibo" && (
                  <label className="est-switch nx-switch" title={activa ? "Pausar" : n.estado === "borrador" ? "Activar" : "Reanudar"}>
                    <input type="checkbox" role="switch" checked={activa} disabled={ocupado === n.id} onChange={() => alternarActiva(n)} aria-label={activa ? "Pausar" : "Activar"} />
                    <span className="sr-only">{activa ? "Activa" : "Inactiva"}</span>
                  </label>
                )}
              </header>

              <div className="nx-card-cuerpo">
                <Cuando texto={n.cuando} />
                {activa && proximo(n) && <span className="nx-meta nx-proximo">Próximo envío: <strong>{proximo(n)}</strong></span>}
                {n.estado !== "activa" && (
                  <span className={`nx-estado ${n.estado}`}>{ESTADOS[n.estado]}{n.motivoPausa ? ` · ${n.motivoPausa}` : ""}</span>
                )}
                <div className="nx-card-fila">
                  <div className="nx-canales">
                    {n.canales.map((c) => <span key={c} className={`nx-canal ${c}`}>{CANALES[c] || c}</span>)}
                  </div>
                  <Avatares personas={personas} />
                </div>
                <div className="nx-ultimo">
                  {n.ultimaEjecucionAt
                    ? <>Último envío {haceCuanto(n.ultimaEjecucionAt)} · <span className={`nx-resultado ${n.ultimoResultado}`}>{RESULTADOS[n.ultimoResultado] || n.ultimoResultado}</span></>
                    : <span className="muted">Aún no se ha enviado</span>}
                  {ver !== "mias" && <span className="muted"> · de {n.soyPropietario ? "ti" : n.propietarioNombre}</span>}
                </div>
              </div>

              <footer className="nx-card-acciones">
                {n.puedeGestionar ? (
                  <>
                    <button type="button" className="btn small btn-primary" disabled={ocupado === n.id || n.estado === "borrador"} onClick={() => enviarAhora(n)} title="Enviar ahora a todos sus destinatarios">
                      <IconSend size={12} /> Enviar ahora
                    </button>
                    <button type="button" className="btn small" disabled={ocupado === n.id} onClick={() => accion(n, () => probarNotificacion(n.id), "Prueba enviada.", true)} title="Te llega solo a ti, con datos reales">
                      <IconEye size={12} /> Probar
                    </button>
                    <div className="spacer" />
                    <button type="button" className="nx-icono" onClick={() => setHistorial(n)} title="Historial de envíos" aria-label="Historial"><IconHistory size={15} /></button>
                    <button type="button" className="nx-icono" onClick={() => setModal(n)} title="Editar" aria-label="Editar"><IconEdit size={15} /></button>
                    <button type="button" className="nx-icono peligro" onClick={() => eliminar(n)} title="Eliminar" aria-label="Eliminar"><IconTrash size={15} /></button>
                  </>
                ) : (
                  <>
                    {n.miBaja
                      ? <button type="button" className="btn small btn-primary" onClick={() => accion(n, () => cambiarSuscripcion(n.id, "alta"), "Volverás a recibirla.")}>Volver a recibir</button>
                      : <button type="button" className="btn small" onClick={() => dejarDeRecibir(n)}>Dejar de recibir</button>}
                    <div className="spacer" />
                    <button type="button" className="nx-icono" onClick={() => setHistorial(n)} title="Historial de envíos" aria-label="Historial"><IconHistory size={15} /></button>
                  </>
                )}
              </footer>
            </article>
          );
        })}

        {ver === "mias" && !cargando && (
          <button type="button" className="nx-card nx-card-nueva" onClick={() => nueva()}>
            <span className="nx-card-nueva-ic"><IconPlus size={22} /></span>
            <strong>Nueva notificación</strong>
            <small>{r.activas >= LIMITES.maxActivasPorPersona ? "Llegaste a 10 activas: podrás guardarla como borrador" : "Escríbela en tus palabras y Nova la arma contigo"}</small>
          </button>
        )}
      </div>

      {!cargando && data.notificaciones.length === 0 && ver !== "mias" && (
        <div className="nx-vacio">
          <IconSpark size={26} />
          <strong>{ver === "recibo" ? "Nadie te ha incluido en sus notificaciones" : "No hay notificaciones con esos filtros"}</strong>
          <span>{ver === "recibo" ? "Cuando alguien te agregue como destinatario, aparecerá aquí." : "Prueba con otro estado o búsqueda."}</span>
        </div>
      )}
      {data.total > 0 && (
        <Paginacion id="notif-pagesize" page={page} size={size} total={data.total} sizes={PAGE_SIZES} onPage={setPage} onSize={setSize} etiqueta="notificación(es)" />
      )}

      {modal !== undefined && (
        <NotificacionModal
          user={user}
          notificacion={modal?.id ? modal : null}
          pedidoInicial={modal?.id ? "" : modal?.pedido || ""}
          canales={canales}
          onClose={() => setModal(undefined)}
          onSaved={(msg) => { setModal(undefined); setPedidoRapido(""); setAviso(msg); window.dispatchEvent(new Event(EVENTO_REVISAR)); cargar(); }}
        />
      )}
      {historial && <HistorialModal notificacion={historial} onClose={() => setHistorial(null)} />}
      {confirmar && <ConfirmarModal pedido={confirmar} onClose={() => setConfirmar(null)} />}
      {aviso && <div className="toast toast-good" role="status">{aviso}</div>}
    </div>
  );
}
