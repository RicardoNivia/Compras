"use client";

import { useCallback, useEffect, useState } from "react";
import { estadoBuzonApi, revisarBuzonApi } from "@/lib/correoApi";
import { crossfade } from "@/lib/crossfade";
import BuzonCompartido from "@/components/correo/BuzonCompartido";
import SoportesCorreo from "@/components/tesoreria/SoportesCorreo";
import { useCatalogos } from "@/components/tesoreria/comun";
import { IconMail, IconSearch, IconSpark, IconCheck, IconMoney, IconSend } from "@/components/icons";

function hace(iso) {
  if (!iso) return "todavía no";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "hace un momento";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  return new Date(iso).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

// Mi correo: la única página del correo de la aplicación (un Gmail compartido al que se reenvían los soportes de pago).
// Arriba, en una frase, si está conectado; luego cómo funciona y dos pestañas: Pagos (soportes que leyó Nova, para
// Tesorería) y Conexión (solo un admin conecta el Gmail).
export default function MiCorreoView({ esAdmin = false, puedePagos = false }) {
  const [estado, setEstado] = useState(null);
  const [tab, setTab] = useState(null);
  const [aviso, setAviso] = useState("");
  const [error, setError] = useState("");
  const [revisando, setRevisando] = useState(false);
  const [version, setVersion] = useState(0); // fuerza recargar las listas después de «Revisar ahora»

  const cargar = useCallback(() => estadoBuzonApi().then((e) => { setEstado(e); return e; }).catch((e) => setError(e.message)), []);
  useEffect(() => {
    cargar().then((e) => {
      if (!e) return;
      // Pestaña inicial: conectar si falta (admin); si no, los pagos.
      setTab(esAdmin && !e.cuenta ? "conexion" : puedePagos ? "pagos" : "conexion");
    });
  }, [cargar, esAdmin, puedePagos]);
  useEffect(() => { if (!aviso) return undefined; const t = setTimeout(() => setAviso(""), 6000); return () => clearTimeout(t); }, [aviso]);

  async function revisar() {
    setRevisando(true); setError("");
    try {
      const r = await revisarBuzonApi();
      setAviso(r.enCurso ? "Nova ya está revisando el correo; en un momento verás el resultado."
        : r.revisados === 0 ? "No hay correos nuevos."
          : `Nova revisó ${r.revisados} correo(s) nuevo(s): ${r.soportes} soporte(s) de pago.${r.omitidos ? ` ${r.omitidos} no traían un comprobante.` : ""}${r.error ? ` Se detuvo: ${r.error}` : ""}`);
      await cargar();
      setVersion((v) => v + 1);
    } catch (e) { setError(e.message); } finally { setRevisando(false); }
  }

  if (!estado) return <div className="mc-vista"><div className="card"><span className="spinner" /></div></div>;
  const c = estado.cuenta;
  const conectado = c && c.estado === "activa";
  const pend = estado.pendientes;

  const TABS = [
    puedePagos && { k: "pagos", color: "morado", icono: <IconMoney size={22} />, titulo: "Pagos", nota: "Soportes de pago que leyó Nova, con el movimiento y el pago a los que cree que corresponden.", n: pend.soportes },
    { k: "conexion", color: "azul", icono: <IconMail size={22} />, titulo: "Conexión", nota: esAdmin ? "Conecta el Gmail, enciende o apaga a Nova y cambia el código." : "Qué correo lee la aplicación.", n: null, estadoTxt: conectado ? "Conectado" : c ? "Revisar" : "Sin conectar" },
  ].filter(Boolean);

  return (
    <div className="mc-vista agentes">
      {aviso && <div className="toast toast-good" role="status">{aviso}</div>}

      {/* En una frase: ¿está conectado? */}
      <section className="ag-hero mc-hero">
        <div className="ag-hero-txt">
          <span className="ag-hero-chip"><IconMail size={13} /> Correo de soportes de pago</span>
          <h1>{conectado ? "Nova está leyendo el correo" : c ? "El correo necesita atención" : "Aún no hay un correo conectado"}</h1>
          <p>
            {conectado
              ? <>Revisa <b>{c.email}</b> cada 10 minutos · última revisión {hace(c.ultimaRevision)}{c.agenteActivo ? "" : " · ahora está apagado"}.</>
              : c ? <>No se pudo leer <b>{c.email}</b>. {esAdmin ? "Ve a Conexión para volver a conectarlo." : "Avísale a un administrador."}</>
                : esAdmin ? <>Conéctalo en la pestaña <b>Conexión</b>: toma 3 pasos.</> : <>Un administrador debe conectarlo.</>}
          </p>
        </div>
        {esAdmin && c && (
          <button type="button" className="btn mc-hero-btn" onClick={revisar} disabled={revisando || !conectado}>
            {revisando ? <><span className="spinner" /> Revisando…</> : <><IconSearch size={14} /> Revisar ahora</>}
          </button>
        )}
      </section>

      {/* Cómo funciona, en tres pasos */}
      <ol className="mc-como" aria-label="Cómo funciona">
        <li><span className="mc-como-i"><IconSend size={16} /></span><div><strong>1. Reenvías</strong><span>Los soportes de pago llegan al Gmail (con reglas de reenvío): PDF, foto o el aviso del banco.</span></div></li>
        <li><span className="mc-como-i"><IconSpark size={16} /></span><div><strong>2. Nova lee</strong><span>Saca los datos y sugiere si el pago ya está registrado y a qué gasto corresponde.</span></div></li>
        <li><span className="mc-como-i"><IconCheck size={16} /></span><div><strong>3. Tú confirmas</strong><span>Nada se registra sin que lo revises aquí. Puedes corregir o descartar.</span></div></li>
      </ol>

      {error && <p className="modal-error" style={{ margin: 0 }}>{error}</p>}

      <div className="ag-selector mc-tabs" role="tablist" aria-label="Secciones del correo">
        {TABS.map((t) => (
          <button key={t.k} type="button" role="tab" aria-selected={tab === t.k} className={`ag-opcion ag-${t.color}`} onClick={() => crossfade(() => setTab(t.k))}>
            <span className="ag-icono" aria-hidden="true">{t.icono}</span>
            <span className="ag-opcion-txt">
              <strong>{t.titulo}</strong>
              <span>{t.nota}</span>
              <em>{t.n != null ? (t.n ? `${t.n} por revisar` : "Nada por revisar") : t.estadoTxt}</em>
            </span>
            {t.n ? <span className="mc-badge">{t.n}</span> : <span className="ag-opcion-check" aria-hidden="true"><IconCheck size={13} /></span>}
          </button>
        ))}
      </div>

      <div data-crossfade>
        {tab === "conexion" && <BuzonCompartido estado={estado} esAdmin={esAdmin} onCambio={cargar} onAviso={setAviso} />}
        {tab === "pagos" && <TabPagos key={`g${version}`} onCambio={cargar} />}
      </div>
    </div>
  );
}

// ---------- Pagos: soportes que leyó Nova (los mismos de Tesorería › Por resolver) ----------
function TabPagos({ onCambio }) {
  const { cat } = useCatalogos();
  return <SoportesCorreo cat={cat} puede onCambio={onCambio} id="mc-pagos" titulo="Soportes de pago" />;
}
