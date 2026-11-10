"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
const VER = [["mias", "Mías"], ["recibo", "Me llegan de otros"], ["todas", "Todas"]];

function proximo(n) {
  const p = n.proximas?.[0];
  return p ? new Date(p.fecha).toLocaleString("es-CO", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null;
}

// "Mis notificaciones": tarjetas con las que configuro (o, para admin, las de todos) y las de otros que me llegan.
// foco: id de una notificación a resaltar (llega desde "Ver la notificación" en la Bandeja o desde Teams).
export default function NotificacionesView({ user, foco = null }) {
  const esAdmin = user.role === "admin";
  const [ver, setVer] = useState("mias");
  const [resaltada, setResaltada] = useState(foco);
  const buscoFoco = useRef(foco ? ["recibo", ...(esAdmin ? ["todas"] : [])] : []);
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

  // Si la notificación a resaltar no está entre "Mías", se busca en "Me llegan de otros" (y en "Todas" para admin).
  useEffect(() => {
    if (!resaltada || cargando) return;
    if (data.notificaciones.some((n) => n.id === resaltada)) {
      const t = setTimeout(() => document.getElementById(`notif-${resaltada}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 150);
      const fin = setTimeout(() => setResaltada(null), 4500);
      return () => { clearTimeout(t); clearTimeout(fin); };
    }
    const siguiente = buscoFoco.current.shift();
    if (siguiente) setVer(siguiente);
    else setResaltada(null);
  }, [resaltada, cargando, data.notificaciones]);
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
  const creadas = data.misCreadas ?? 0;
  const lleno = creadas >= LIMITES.maxPorPersona;
  const pct = Math.min(100, Math.round((creadas / LIMITES.maxPorPersona) * 100));
  const nueva = (pedido = "") => setModal({ pedido });

  return (
    <div className="nx-vista">
      {/* Encabezado compacto: pedido a Nova + indicadores (las tarjetas son lo principal) */}
      <section className="nx-barra">
        <div className="nx-barra-izq">
        <h2 className="nx-barra-titulo"><IconSpark size={16} /> ¿Qué quieres que te avise?</h2>
        <form className="nx-barra-pedido" onSubmit={(e) => { e.preventDefault(); if (!lleno) nueva(pedidoRapido); }}>
          <input value={pedidoRapido} onChange={(e) => setPedidoRapido(e.target.value)} disabled={lleno}
            placeholder={lleno ? "Llegaste a 10 notificaciones: elimina una para crear otra" : "Escríbelo como se lo dirías a alguien. Ej.: cada lunes, cuántas compras se registraron la semana anterior"}
            aria-label="Pedido para Nova" />
          <button type="submit" className="btn btn-primary" disabled={lleno}><IconSpark size={14} /> Crear con Nova</button>
        </form>
        </div>
        <div className="nx-barra-kpis">
          <div className={`nx-mini nx-mini-principal${lleno ? " lleno" : ""}`} title={lleno ? "Elimina una para crear otra" : `Puedes crear ${LIMITES.maxPorPersona - creadas} más`}>
            <span className="nx-mini-anillo" style={{ "--pct": pct }}><span>{creadas}</span></span>
            <span><b>de {LIMITES.maxPorPersona}</b><small>{lleno ? "Llegaste al máximo" : "creadas"}</small></span>
          </div>
          <div className="nx-mini"><b>{r.activas}</b><small>Activas</small></div>
          <div className="nx-mini"><b>{r.enviadasHoy}</b><small>Enviadas hoy</small></div>
          <div className="nx-mini"><b>{r.pausadas}</b><small>Pausadas</small></div>
          <div className="nx-mini"><b>{r.deOtros}</b><small>De otros</small></div>
        </div>
      </section>
      {canales && (canales.teams !== "real" || canales.teamsDestinoPrueba) && (
        <p className="nx-nota-canal">
          <IconAlert size={12} />
          {canales.teams === "simulado" ? "Teams en modo simulado" : canales.teams === "desactivado" ? "Teams sin configurar: llegan solo a la app" : "Teams activo"}
          {canales.teamsDestinoPrueba ? " · local: Teams se redirige al correo de prueba" : ""} · correo deshabilitado
        </p>
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
        {/* Crear siempre va primero */}
        {ver === "mias" && !cargando && (
          <button type="button" className={`nx-card nx-card-nueva${lleno ? " lleno" : ""}`} onClick={() => !lleno && nueva()} disabled={lleno}>
            <span className="nx-card-nueva-ic"><IconPlus size={22} /></span>
            <strong>{lleno ? "Llegaste al máximo" : "Nueva notificación"}</strong>
            <small>{lleno ? `Cada persona puede crear hasta ${LIMITES.maxPorPersona} notificaciones. Elimina una para crear otra.` : `Escríbela en tus palabras y Nova la arma contigo · puedes crear hasta ${LIMITES.maxPorPersona} (llevas ${creadas})`}</small>
          </button>
        )}
        {data.notificaciones.map((n) => {
          const personas = n.destinatarios.map((d) => ({ nombre: d.userNombre, yo: d.userId === user.id, apagado: d.deBaja }));
          const activa = n.estado === "activa";
          return (
            <article key={n.id} id={`notif-${n.id}`} className={`nx-card estado-${n.estado}${ocupado === n.id ? " ocupada" : ""}${resaltada === n.id ? " foco" : ""}`}>
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
                  <div className="nx-canales" title="Por dónde le llega a cada destinatario">
                    <span className="nx-canales-lbl">Llega por</span>
                    {["app", "teams", "correo"].filter((c) => n.canales.includes(c)).map((c) => <span key={c} className={`nx-canal ${c}`}>{c === "app" ? "App" : CANALES[c] || c}</span>)}
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
                    {n.disparador === "evento" ? (
                      <span className="nx-por-evento" title="Se envía sola cuando ocurre el evento">⚡ Por evento</span>
                    ) : (
                      <button type="button" className="btn small btn-primary" disabled={ocupado === n.id || n.estado === "borrador"} onClick={() => enviarAhora(n)} title="Enviar ahora a todos sus destinatarios">
                        <IconSend size={12} /> Enviar ahora
                      </button>
                    )}
                    {n.disparador !== "evento" && (
                      <button type="button" className="btn small" disabled={ocupado === n.id} onClick={() => accion(n, () => probarNotificacion(n.id), "Prueba enviada.", true)} title="Envía una prueba con datos reales a todos sus destinatarios (marcada como PRUEBA)">
                        <IconEye size={12} /> Probar
                      </button>
                    )}
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

      </div>

      {!cargando && data.notificaciones.length === 0 && ver !== "mias" && (
        <div className="nx-vacio">
          <IconSpark size={26} />
          <strong>{ver === "recibo" ? "Nadie te ha incluido en sus notificaciones" : "No hay notificaciones con esos filtros"}</strong>
          <span>{ver === "recibo" ? "Cuando alguien te agregue como destinatario, aparecerá aquí." : "Prueba con otro estado o búsqueda."}</span>
        </div>
      )}
      {ver !== "mias" && data.total > size && (
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
