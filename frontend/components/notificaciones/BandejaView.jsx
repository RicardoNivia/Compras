"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { listarBandeja, marcarLeidas, cambiarSuscripcion, avisarNoLeidas } from "@/lib/notificacionesApi";
import ContenidoNotificacion from "@/components/notificaciones/ContenidoNotificacion";
import SolicitudProveedorCorreo from "@/components/correo/SolicitudProveedorCorreo";
import ConfirmarModal from "@/components/notificaciones/ConfirmarModal";
import { FuenteIcono, haceCuanto, grupoDia, Paginacion } from "@/components/notificaciones/ui";
import { IconCheck, IconBell, IconChevronDown, IconClock } from "@/components/icons";

const PAGE_SIZES = [25, 50, 100];

function etiquetaOrigen(it) {
  if (it.origen === "prueba") return { cls: "prueba", texto: "Prueba" };
  if (it.origen === "manual") return { cls: "manual", texto: `Enviada manualmente${it.contenido?.manualPor ? ` por ${it.contenido.manualPor}` : ""}` };
  if (it.origen === "recuperado") return { cls: "prueba", texto: "Con retraso" };
  return null;
}

// Bandeja: lo que le llegó a la persona por la app, agrupado por día. Al abrir una notificación se marca como leída.
export default function BandejaView() {
  const [data, setData] = useState({ items: [], total: 0, noLeidas: 0, page: 1 });
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(PAGE_SIZES[0]);
  const [soloNoLeidas, setSoloNoLeidas] = useState(false);
  const [abierta, setAbierta] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [confirmar, setConfirmar] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await listarBandeja({ page, size, soloNoLeidas: soloNoLeidas ? "1" : "" });
      setData(r);
      if (r.page !== page) setPage(r.page);
      avisarNoLeidas(r.noLeidas);
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, [page, size, soloNoLeidas]);

  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { setPage(1); }, [size, soloNoLeidas]);
  useEffect(() => { if (!aviso) return; const t = setTimeout(() => setAviso(""), 3500); return () => clearTimeout(t); }, [aviso]);

  async function abrir(item) {
    setAbierta(abierta === item.id ? null : item.id);
    if (!item.leidaAt) {
      await marcarLeidas({ ids: [item.id] }).catch(() => {});
      setData((d) => {
        const noLeidas = Math.max(0, d.noLeidas - 1);
        avisarNoLeidas(noLeidas);
        return { ...d, noLeidas, items: d.items.map((x) => (x.id === item.id ? { ...x, leidaAt: new Date().toISOString() } : x)) };
      });
    }
  }

  async function leerTodas() {
    await marcarLeidas({ todas: true }).catch((e) => setError(e.message));
    await cargar();
  }

  const dejarDeRecibir = (item) => setConfirmar({
    titulo: "Dejar de recibir",
    mensaje: `¿Dejar de recibir "${item.notificacionNombre}"?`,
    detalle: `${item.propietarioNombre} verá que te diste de baja. Puedes volver a recibirla desde Mis notificaciones → Me llegan de otros.`,
    boton: "Dejar de recibir",
    onOk: async () => {
      try {
        await cambiarSuscripcion(item.notificacionId, "baja");
        setAviso("Listo: ya no recibirás esa notificación.");
      } catch (e) {
        setError(e.message);
      }
    },
  });

  // Agrupa por día manteniendo el orden (más recientes primero).
  const grupos = [];
  for (const it of data.items) {
    const g = grupoDia(it.createdAt);
    if (!grupos.length || grupos[grupos.length - 1].dia !== g) grupos.push({ dia: g, items: [] });
    grupos[grupos.length - 1].items.push(it);
  }

  return (
    <div className="nx-vista">
      <div className="nx-filtros">
        <div className="nx-segmento" role="tablist" aria-label="Filtro">
          <button type="button" role="tab" aria-selected={!soloNoLeidas} onClick={() => setSoloNoLeidas(false)}>Todas</button>
          <button type="button" role="tab" aria-selected={soloNoLeidas} onClick={() => setSoloNoLeidas(true)}>
            Sin leer {data.noLeidas > 0 && <span className="nx-num rojo">{data.noLeidas}</span>}
          </button>
        </div>
        <div className="spacer" />
        <button type="button" className="btn small" onClick={leerTodas} disabled={!data.noLeidas}>
          <IconCheck size={12} /> Marcar todas como leídas
        </button>
      </div>
      {error && <p className="modal-error">{error}</p>}

      {!cargando && data.items.length === 0 && (
        <div className="nx-vacio">
          <IconBell size={28} />
          <strong>{soloNoLeidas ? "Estás al día" : "Tu bandeja está vacía"}</strong>
          <span>{soloNoLeidas ? "No tienes notificaciones sin leer." : "Cuando se cumpla una notificación configurada para ti, llegará aquí y te avisaremos en pantalla."}</span>
          {!soloNoLeidas && <Link href="/alertas?tab=notificaciones" className="btn btn-primary small">Configurar una notificación</Link>}
        </div>
      )}

      {grupos.map((g) => (
        <section key={g.dia} className="nx-dia">
          <h4 className="nx-dia-titulo">{g.dia}</h4>
          <div className="nx-feed">
            {g.items.map((it) => {
              const origen = etiquetaOrigen(it);
              const abiertaEsta = abierta === it.id;
              return (
                <article key={it.id} className={`nx-item${it.leidaAt ? "" : " no-leida"}${abiertaEsta ? " abierta" : ""}`}>
                  <button type="button" className="nx-item-cabeza" onClick={() => abrir(it)} aria-expanded={abiertaEsta}>
                    <FuenteIcono fuente={it.fuente || it.contenido?.fuente} size={42} />
                    <div className="nx-item-texto">
                      <div className="nx-item-linea">
                        <strong>{it.contenido?.titulo || it.notificacionNombre}</strong>
                        {origen && <span className={`nx-origen ${origen.cls}`}>{origen.texto}</span>}
                      </div>
                      {it.contenido?.texto && <p>{it.contenido.texto}</p>}
                      <span className="nx-item-de">
                        {it.contenido?.sistema ? (it.contenido.fuente === "bienestar" ? `Aviso de ${it.contenido.notificacionNombre || "Bienestar"}` : it.contenido.fuente === "correo" ? "Aviso del agente de correo" : "Aviso de solicitudes de compra") : <>De la notificación <b>«{it.notificacionNombre || "eliminada"}»</b></>}
                        {it.propietarioNombre ? <> · configurada por {it.deOtro ? it.propietarioNombre : "ti"}</> : null}
                        {it.cuando ? <> · <IconClock size={11} /> {it.cuando}</> : null}
                      </span>
                    </div>
                    <div className="nx-item-lado">
                      <span className="nx-item-hora" title={new Date(it.createdAt).toLocaleString("es-CO")}>{haceCuanto(it.createdAt)}</span>
                      {it.contenido?.total != null && <span className="nx-item-total">{it.contenido.total}</span>}
                      <IconChevronDown size={14} className="nx-chevron" />
                    </div>
                  </button>
                  {abiertaEsta && (
                    <div className="nx-item-detalle">
                      {it.contenido?.solicitudCorreoId
                        ? <SolicitudProveedorCorreo id={it.contenido.solicitudCorreoId} />
                        : <ContenidoNotificacion c={it.contenido} />}
                      {it.deOtro && it.origen !== "prueba" && (
                        <div className="nx-item-pie">
                          <button type="button" className="btn small btn-ghost" onClick={() => dejarDeRecibir(it)}>Dejar de recibir esta notificación</button>
                        </div>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      ))}

      {data.total > 0 && (
        <Paginacion id="bandeja-pagesize" page={page} size={size} total={data.total} sizes={PAGE_SIZES} onPage={setPage} onSize={setSize} etiqueta="notificación(es)" />
      )}
      {confirmar && <ConfirmarModal pedido={confirmar} onClose={() => setConfirmar(null)} />}
      {aviso && <div className="toast toast-good" role="status">{aviso}</div>}
    </div>
  );
}
