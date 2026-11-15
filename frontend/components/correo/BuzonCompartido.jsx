"use client";

import { useState } from "react";
import { guardarBuzonApi, agenteBuzonApi, quitarBuzonApi } from "@/lib/correoApi";
import { useConfirmar } from "@/components/Confirmar";
import { IconMail, IconCheck, IconArrowRight } from "@/components/icons";

const fecha = (iso) => (iso ? new Date(iso).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "todavía no");

// Pestaña «Conexión» de Mi correo: conectar el Gmail de solicitudes (asistente de 3 pasos) o, si ya está, ver su
// estado, encender/apagar el agente, cambiar el código o quitarlo. Solo administradores (backend/lib/buzonCompartido.js).
export default function BuzonCompartido({ estado, esAdmin, onCambio, onAviso }) {
  const { confirmar } = useConfirmar();
  const [form, setForm] = useState({ email: "", clave: "" });
  const [editando, setEditando] = useState(false);
  const [ocupado, setOcupado] = useState("");
  const [error, setError] = useState("");
  const c = estado?.cuenta;

  async function hacer(clave, fn, ok) {
    setOcupado(clave); setError("");
    try {
      const r = await fn();
      if (ok) onAviso?.(typeof ok === "function" ? ok(r) : ok);
      await onCambio?.();
      return r;
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setOcupado("");
    }
  }

  async function guardar(e) {
    e.preventDefault();
    const r = await hacer("guardar", () => guardarBuzonApi(form.email, form.clave),
      (x) => `¡Listo! El correo quedó conectado (${x.mensajes.toLocaleString("es-CO")} correo(s) en la Bandeja). Nova lo revisará cada 10 minutos; la primera vez lee los últimos 7 días.`);
    if (r) { setForm({ email: "", clave: "" }); setEditando(false); }
  }

  async function quitar() {
    const ok = await confirmar({
      titulo: "Desconectar el correo",
      mensaje: `¿Dejar de leer ${c.email}?`,
      detalle: "Se borra el código guardado y Nova deja de revisar ese Gmail. Los soportes que ya llegaron se conservan.",
      boton: "Sí, desconectar", peligro: true,
    });
    if (ok) hacer("quitar", quitarBuzonApi, "El correo quedó desconectado.");
  }

  if (!esAdmin) {
    return (
      <section className="mc-panel">
        <h3>Solo un administrador conecta el correo</h3>
        <p className="mc-texto">{c ? <>La aplicación lee <strong>{c.email}</strong>. Los soportes que Nova encuentra aparecen en la pestaña Pagos.</> : "Todavía no hay un correo conectado. Pídele a un administrador que lo configure en esta página."}</p>
      </section>
    );
  }

  // ---------- Conectado: estado y acciones ----------
  if (c && !editando) {
    const ok = c.estado === "activa";
    return (
      <section className="mc-panel">
        <div className="mc-conectado">
          <span className={`mc-estado-icono ${ok ? "ok" : "mal"}`} aria-hidden="true">{ok ? <IconCheck size={20} /> : "!"}</span>
          <div className="mc-conectado-txt">
            <h3>{ok ? "El correo está conectado" : "Hay que volver a conectar el correo"}</h3>
            <p className="mc-texto"><strong>{c.email}</strong> · conectado el {fecha(c.createdAt)}{c.creadoPorNombre ? ` por ${c.creadoPorNombre}` : ""}</p>
          </div>
        </div>
        {c.ultimoError && <p className={ok ? "mc-nota" : "modal-error"} style={{ margin: 0 }}>{ok ? "En la última revisión: " : ""}{c.ultimoError}</p>}
        {error && <p className="modal-error" style={{ margin: 0 }}>{error}</p>}

        <div className="mc-datos">
          <div><span>Última revisión</span><strong>{fecha(c.ultimaRevision)}</strong></div>
          <div><span>Revisa cada</span><strong>10 minutos</strong></div>
          <div><span>Por revisar</span><strong>{estado.pendientes.soportes} soporte(s) de pago</strong></div>
        </div>

        <label className={`ag-switch ${c.agenteActivo ? "on" : ""}`}>
          <span className="ag-switch-txt">
            <strong>Nova revisa el correo</strong>
            <small>{c.agenteActivo ? "Encendido: lee lo nuevo cada 10 minutos" : "Apagado: no lee nada hasta que lo enciendas"}</small>
          </span>
          <span className="toggle-switch">
            <input type="checkbox" role="switch" checked={c.agenteActivo} disabled={!!ocupado}
              onChange={(e) => hacer("agente", () => agenteBuzonApi(e.target.checked), e.target.checked ? "Nova vuelve a revisar el correo." : "Nova dejó de revisar el correo.")} />
            <span className="toggle-track"><span className="toggle-thumb" /></span>
          </span>
        </label>

        <div className="mc-lee">
          <div><strong>Qué lee</strong><span>Soportes de pago: el comprobante en PDF o foto, o el aviso del banco en el texto del correo.</span></div>
          <div><strong>Qué no lee</strong><span>Promociones, anuncios masivos ni correos sin un comprobante. Nunca envía, borra ni mueve correos.</span></div>
        </div>

        <div className="mc-fila">
          <button type="button" className="btn" onClick={() => { setEditando(true); setForm({ email: c.email, clave: "" }); setError(""); }} disabled={!!ocupado}>Cambiar el código</button>
          <div className="spacer" />
          <button type="button" className="btn btn-ghost btn-danger-text" onClick={quitar} disabled={!!ocupado}>Desconectar</button>
        </div>
      </section>
    );
  }

  // ---------- Sin conectar (o cambiando el código): asistente ----------
  return (
    <section className="mc-panel">
      <div>
        <h3>{editando ? "Cambiar el código del correo" : "Conecta el correo en 3 pasos"}</h3>
        <p className="mc-texto">Usa un Gmail creado solo para esto (por ejemplo soportes.empresa@gmail.com). Gmail no deja conectar con la contraseña normal: pide un <strong>código de 16 letras</strong> que se crea en tu cuenta de Google.</p>
      </div>
      <ol className="mc-pasos-guia">
        <li>
          <span className="mc-paso-n">1</span>
          <div>
            <strong>Activa la verificación en dos pasos</strong>
            <span>Entra con el Gmail y agrega un celular para recibir códigos por SMS. Sin esto, Google dice «La opción que buscas no está disponible para tu cuenta».</span>
            <a className="btn small" href="https://myaccount.google.com/signinoptions/two-step-verification" target="_blank" rel="noopener noreferrer">Abrir en Google <IconArrowRight size={12} /></a>
          </div>
        </li>
        <li>
          <span className="mc-paso-n">2</span>
          <div>
            <strong>Crea el código de 16 letras</strong>
            <span>En «Contraseñas de aplicación» escribe un nombre (por ejemplo «Panel de Compras») y pulsa Crear. Google muestra algo como <code>abcd efgh ijkl mnop</code>: cópialo.</span>
            <a className="btn small" href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer">Abrir en Google <IconArrowRight size={12} /></a>
          </div>
        </li>
        <li>
          <span className="mc-paso-n">3</span>
          <div>
            <strong>Pégalo aquí y conecta</strong>
            <span>El panel prueba la conexión antes de guardar y guarda el código cifrado.</span>
            <form onSubmit={guardar} className="mc-form">
              <div className="field">
                <label htmlFor="bc-email">Correo de Gmail</label>
                <input id="bc-email" type="email" autoComplete="off" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="soportes.empresa@gmail.com" required />
              </div>
              <div className="field">
                <label htmlFor="bc-clave">Código de 16 letras</label>
                <input id="bc-clave" type="password" autoComplete="new-password" value={form.clave} onChange={(e) => setForm({ ...form, clave: e.target.value })} placeholder="xxxx xxxx xxxx xxxx" required />
                <small className="muted">No es la contraseña con la que entras a Gmail. Los espacios no importan.</small>
              </div>
              {error && <p className="modal-error" style={{ margin: 0 }}>{error}</p>}
              <div className="mc-fila">
                <button type="submit" className="btn btn-primary" disabled={!!ocupado || !form.email.trim() || !form.clave.trim()}>
                  {ocupado === "guardar" ? <><span className="spinner" /> Probando con Gmail…</> : <><IconMail size={14} /> Probar y conectar</>}
                </button>
                {editando && <button type="button" className="btn" onClick={() => { setEditando(false); setError(""); }}>Cancelar</button>}
              </div>
            </form>
          </div>
        </li>
      </ol>
    </section>
  );
}
