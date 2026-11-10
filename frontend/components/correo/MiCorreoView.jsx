"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import {
  estadoCorreoApi, cambiarAgenteCorreoApi, desvincularCorreoApi, revisarCorreoApi, simularCorreoApi, listarSolicitudesCorreoApi,
} from "@/lib/correoApi";
import SolicitudProveedorCorreo from "@/components/correo/SolicitudProveedorCorreo";
import ConfirmarModal from "@/components/notificaciones/ConfirmarModal";
import { Paginacion } from "@/components/notificaciones/ui";
import { IconMail, IconSearch, IconSpark, IconChevronDown } from "@/components/icons";

const PAGE_SIZES = [10, 25, 50, 100];
const FILTROS = [["pendiente", "Pendientes"], ["aprobada", "Agregadas"], ["descartada", "Descartadas"], ["", "Todas"]];
const ESTADO_PILL = { pendiente: ["warning", "Pendiente"], aprobada: ["good", "Agregada"], descartada: ["muted", "Descartada"] };
const fecha = (iso) => (iso ? new Date(iso).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

function Celda({ v }) {
  if (!v) return <span className="muted">—</span>;
  return <span className="desc-tooltip-wrap"><span className="desc-text">{v}</span><span className="desc-tooltip-bubble">{v}</span></span>;
}

// Mi correo: vincular el correo de Microsoft 365, encender el agente de correo y ver las solicitudes de proveedor que
// encontró. Con CORREO_MODO=simulado (local) se prueba pegando un correo.
export default function MiCorreoView({ inicial, vinculado, errorVinculo, puedeRegistrar }) {
  const [estado, setEstado] = useState(inicial);
  const [aviso, setAviso] = useState(vinculado ? "Tu correo quedó vinculado. El agente revisará tu bandeja de entrada cada 10 minutos." : "");
  const [error, setError] = useState(errorVinculo || "");
  const [ocupado, setOcupado] = useState("");
  const [confirmar, setConfirmar] = useState(null);

  // Prueba (modo simulado)
  const [prueba, setPrueba] = useState({ remitente: "", asunto: "", cuerpo: "", adjunto: null });
  const [resultadoPrueba, setResultadoPrueba] = useState(null);

  // Tabla de solicitudes
  const [filtro, setFiltro] = useState("pendiente");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(PAGE_SIZES[0]);
  const [lista, setLista] = useState({ items: [], total: 0 });
  const [abierta, setAbierta] = useState(null);

  const modo = estado?.modo;
  const cuenta = estado?.cuenta;

  const recargarEstado = useCallback(() => estadoCorreoApi().then(setEstado).catch((e) => setError(e.message)), []);
  const recargarLista = useCallback(async () => {
    try {
      const r = await listarSolicitudesCorreoApi({ estado: filtro, page, size });
      setLista(r);
      if (r.page !== page) setPage(r.page);
    } catch (e) {
      setError(e.message);
    }
  }, [filtro, page, size]);

  useEffect(() => { recargarLista(); }, [recargarLista]);
  useEffect(() => { setPage(1); setAbierta(null); }, [filtro, size]);
  useEffect(() => {
    if (vinculado || errorVinculo) window.history.replaceState(null, "", "/mi-correo");
  }, [vinculado, errorVinculo]);

  useEffect(() => { if (!aviso) return undefined; const t = setTimeout(() => setAviso(""), 4500); return () => clearTimeout(t); }, [aviso]);

  const cambio = () => { recargarEstado(); recargarLista(); };

  async function accion(clave, fn, ok) {
    setOcupado(clave);
    setError("");
    try {
      const r = await fn();
      if (ok) setAviso(typeof ok === "function" ? ok(r) : ok);
      cambio();
      return r;
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setOcupado("");
    }
  }

  const revisar = () => accion("revisar", revisarCorreoApi, (r) => (r.enCurso
    ? "El agente ya está revisando tu correo; en un momento verás el resultado."
    : `Listo: ${r.revisados} correo(s) nuevo(s), ${r.analizados} leído(s) por Nova, ${r.solicitudes} solicitud(es) de proveedor.`));

  const desvincular = () => setConfirmar({
    titulo: "Desvincular mi correo",
    mensaje: "¿Desvincular tu correo?",
    detalle: "El agente dejará de leer tu bandeja de entrada y se borra la autorización guardada. Las solicitudes que ya encontró se conservan.",
    boton: "Desvincular",
    onOk: () => accion("desvincular", desvincularCorreoApi, "Tu correo quedó desvinculado."),
  });

  async function probar(e) {
    e.preventDefault();
    setResultadoPrueba(null);
    const r = await accion("probar", () => simularCorreoApi(prueba));
    if (r) setResultadoPrueba(r);
  }

  return (
    <div className="mc-vista">
      {aviso && <div className="toast toast-good" role="status">{aviso}</div>}
      {error && <p className="modal-error">{error}</p>}

      <section className="mc-tarjeta">
        <div className="mc-fila">
          <IconMail size={20} />
          <h3>{cuenta ? `Correo vinculado: ${cuenta.email}` : "Vincula tu correo"}</h3>
          {modo === "simulado" && <span className="pill warning">Modo de prueba</span>}
          {cuenta && <span className={`pill ${cuenta.estado === "activa" ? "good" : "critical"}`}>{cuenta.estado === "activa" ? "Conectado" : "Hay que volver a vincular"}</span>}
        </div>

        {modo === "desactivado" && (
          <p className="prov-note">La conexión con el correo de Microsoft aún no está habilitada en el servidor. TI debe registrar la aplicación en Microsoft Entra ID (ver docs/correo-agente-proveedores.md); cuando esté lista, aquí aparecerá el botón para vincular.</p>
        )}

        {modo !== "desactivado" && !cuenta && (
          <>
            <p style={{ margin: 0 }}>Cuando te llegue al correo una solicitud para registrar un proveedor nuevo, el agente la lee (también el RUT adjunto), saca los datos y te la deja en la <strong>Bandeja</strong> para que la apruebes. Nunca registra un proveedor sin que tú lo confirmes.</p>
            <ol className="mc-pasos">
              <li>Inicias sesión con tu cuenta de Microsoft de Sinco ({estado.emailUsuario}).</li>
              <li>Autorizas solo la <strong>lectura</strong> de tu correo: el panel no puede enviar, borrar ni mover correos.</li>
              <li>Cada 10 minutos el agente revisa tu bandeja de entrada. Solo los correos que hablan de registrar un proveedor pasan a Nova.</li>
            </ol>
            <div className="mc-fila">
              <a className="btn btn-primary" href="/api/correo/vincular"><IconMail size={14} /> {modo === "simulado" ? "Vincular (modo de prueba)" : "Vincular mi correo de Microsoft"}</a>
            </div>
          </>
        )}

        {cuenta && (
          <>
            {cuenta.estado !== "activa" && cuenta.ultimoError && <p className="modal-error" style={{ margin: 0 }}>{cuenta.ultimoError}</p>}
            {cuenta.estado === "activa" && cuenta.ultimoError && <p className="prov-note" style={{ margin: 0 }}>Última revisión: {cuenta.ultimoError}</p>}
            <p className="prov-note" style={{ margin: 0 }}>
              Vinculado el {fecha(cuenta.createdAt)}
              {cuenta.proveedor === "microsoft" && <> · última revisión: {cuenta.ultimaRevision ? fecha(cuenta.ultimaRevision) : "todavía no"}</>}
              {estado.pendientes > 0 && <> · <strong>{estado.pendientes}</strong> solicitud(es) pendiente(s)</>}
            </p>
            {!puedeRegistrar && <p className="prov-note" style={{ margin: 0 }}>Tu rol no puede registrar proveedores, así que el agente no revisará tu correo. Pide el permiso «Editar proveedores».</p>}
            <div className="mc-fila">
              <label className={`ag-switch ${cuenta.agenteActivo ? "on" : ""}`}>
                <span className="ag-switch-txt">
                  <strong>Agente de correo</strong>
                  <small>{cuenta.agenteActivo ? "Encendido · revisa cada 10 minutos" : "Apagado · no lee tu correo"}</small>
                </span>
                <span className="toggle-switch">
                  <input type="checkbox" role="switch" checked={cuenta.agenteActivo} disabled={!!ocupado}
                    onChange={(e) => accion("agente", () => cambiarAgenteCorreoApi(e.target.checked), e.target.checked ? "Agente encendido." : "Agente apagado: no leerá tu correo.")} />
                  <span className="toggle-track"><span className="toggle-thumb" /></span>
                </span>
              </label>
              <div className="spacer" />
              {cuenta.proveedor === "microsoft" && (
                <button type="button" className="btn" onClick={revisar} disabled={!!ocupado || !cuenta.agenteActivo || cuenta.estado !== "activa"}>
                  {ocupado === "revisar" ? <span className="spinner" /> : <IconSearch size={13} />} Revisar ahora
                </button>
              )}
              {cuenta.estado !== "activa" && <a className="btn btn-primary" href="/api/correo/vincular">Volver a vincular</a>}
              <button type="button" className="btn btn-ghost btn-danger-text" onClick={desvincular} disabled={!!ocupado}>Desvincular</button>
            </div>
          </>
        )}
      </section>

      {modo === "simulado" && cuenta && (
        <section className="mc-tarjeta">
          <h3><IconSpark size={14} /> Probar con un correo</h3>
          <p className="prov-note" style={{ margin: 0 }}>Modo de prueba: pega un correo como el que te llega (y adjunta el RUT si quieres). El agente lo procesa igual que si hubiera llegado a tu bandeja y, si es una solicitud, te deja el aviso en la Bandeja.</p>
          <form onSubmit={probar} className="prov-form" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="prov-form-grid">
              <div className="field">
                <label htmlFor="mc-remitente">De</label>
                <input id="mc-remitente" value={prueba.remitente} onChange={(e) => setPrueba({ ...prueba, remitente: e.target.value })} placeholder="Persona Ejemplo <usuario@example.com>" />
              </div>
              <div className="field">
                <label htmlFor="mc-asunto">Asunto</label>
                <input id="mc-asunto" value={prueba.asunto} onChange={(e) => setPrueba({ ...prueba, asunto: e.target.value })} placeholder="Registro de proveedor en SRM" />
              </div>
            </div>
            <div className="field">
              <label htmlFor="mc-cuerpo">Texto del correo</label>
              <textarea id="mc-cuerpo" rows={8} value={prueba.cuerpo} onChange={(e) => setPrueba({ ...prueba, cuerpo: e.target.value })} placeholder="Hola Lau, por favor tu ayuda para el registro de este proveedor en SRM…" />
            </div>
            <div className="field">
              <label htmlFor="mc-adjunto">Adjunto (RUT en PDF o foto, opcional)</label>
              <input id="mc-adjunto" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={(e) => setPrueba({ ...prueba, adjunto: e.target.files?.[0] || null })} />
            </div>
            <div className="mc-fila">
              <button type="submit" className="btn btn-primary" disabled={!!ocupado || !prueba.cuerpo.trim()}>
                {ocupado === "probar" ? <><span className="spinner" /> Nova está leyendo…</> : <><IconSpark size={13} /> Procesar como si llegara</>}
              </button>
            </div>
          </form>
          {resultadoPrueba && !resultadoPrueba.solicitud && <p className="prov-note">{resultadoPrueba.motivo}</p>}
          {resultadoPrueba?.solicitud && (
            <>
              <p className="sc-hecho">Es una solicitud de proveedor: quedó en tu Bandeja. Así se ve:</p>
              <SolicitudProveedorCorreo id={resultadoPrueba.solicitud.id} onCambio={cambio} />
            </>
          )}
        </section>
      )}

      <section className="table-card">
        <div className="mc-fila" style={{ padding: "12px 14px 0" }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>Solicitudes de proveedor encontradas</h3>
          <div className="spacer" />
          <div className="nx-segmento" role="tablist" aria-label="Estado">
            {FILTROS.map(([v, t]) => <button key={v || "todas"} type="button" role="tab" aria-selected={filtro === v} onClick={() => setFiltro(v)}>{t}</button>)}
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr><th>Recibido</th><th>De</th><th>Proveedor</th><th>NIT</th><th>Falta</th><th>Estado</th><th aria-label="Abrir" /></tr>
            </thead>
            <tbody>
              {lista.items.length === 0 && (
                <tr><td colSpan={7} className="muted" style={{ textAlign: "center", padding: 20 }}>No hay solicitudes {filtro ? FILTROS.find((f) => f[0] === filtro)[1].toLowerCase() : ""}.</td></tr>
              )}
              {lista.items.map((s) => {
                const [cls, txt] = ESTADO_PILL[s.estado] || ["muted", s.estado];
                const abiertaEsta = abierta === s.id;
                return (
                  <Fragment key={s.id}>
                    <tr className="clickable" onClick={() => setAbierta(abiertaEsta ? null : s.id)} aria-expanded={abiertaEsta}>
                      <td>{fecha(s.recibidoAt || s.createdAt)}</td>
                      <td><Celda v={s.remitente} /></td>
                      <td><Celda v={s.datos?.nombre} /></td>
                      <td className="mono">{s.datos?.nit || <span className="muted">—</span>}</td>
                      <td>{s.estado === "pendiente" && s.faltantes?.length ? <Celda v={s.faltantes.map((f) => ({ nit: "NIT", nombre: "Razón social", descripcion: "Descripción" }[f.campo])).join(", ")} /> : <span className="muted">—</span>}</td>
                      <td><span className={`pill ${cls}`}>{txt}</span></td>
                      <td><IconChevronDown size={14} style={{ transform: abiertaEsta ? "rotate(180deg)" : undefined }} /></td>
                    </tr>
                    {abiertaEsta && (
                      <tr className="mc-detalle"><td colSpan={7}><SolicitudProveedorCorreo id={s.id} onCambio={cambio} /></td></tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <Paginacion id="mc-pagesize" page={page} size={size} total={lista.total} sizes={PAGE_SIZES} onPage={setPage} onSize={setSize} etiqueta="solicitud(es)" />
      </section>

      {confirmar && <ConfirmarModal pedido={confirmar} onClose={() => setConfirmar(null)} />}
    </div>
  );
}
