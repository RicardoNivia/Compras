"use client";

import { useModulo } from "@/components/ModuloShell";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { leerPantallaNova } from "@/lib/novaPantalla";
import { sendAgentChatApi } from "@/lib/api";
import { canViewAgenteIA } from "@/lib/roles";
import { ALL_NAV_ITEMS } from "@/components/Sidebar";
import { useAutoGrow } from "@/lib/useAutoGrow";
import AssistantContent, { ThinkingLabel } from "@/components/AgentMessageContent";
import { IconSpark, IconSend, IconPlus } from "@/components/icons";
import { PREGUNTAS_BIENESTAR, PREGUNTAS_TESORERIA, PREGUNTAS_COMPRAS, preguntasAlAzar } from "@/lib/preguntasGerente";

// Duración de la animación de cierre (debe calzar con la transición de
// .floating-agent-panel en globals.css) — el panel se queda montado hasta que
// termina de encogerse, si no la transición de salida nunca se vería.
const CLOSE_ANIM_MS = 260;

const PRIMERA = "¿Qué puedo hacer en esta sección?";

// Encuentra en qué sección del menú está parado el usuario ahora mismo, para
// que el Agente IA interprete "aquí"/"esta pantalla" correctamente (ver
// backend/app/api/agent/chat/route.js#buildDynamicInstructionSuffix). Es la
// MISMA lista de secciones que pinta el Sidebar — basta con el prefijo del
// pathname porque algunas secciones tienen subrutas (ej. "/registros/123").
function sectionLabelFor(pathname) {
  // Subpantallas de Proveedores y la configuración del ciclo (el menú solo tiene una entrada).
  if (pathname?.startsWith("/proveedores/indicadores")) return "Indicadores de proveedores";
  if (pathname?.startsWith("/proveedores/informe")) return "Informe mensual de proveedores";
  if (pathname?.startsWith("/proveedores")) return "Gestión de proveedores";
  // El ciclo de proveedores vive dentro de Maestros (/maestros?seccion=cicloProveedores).
  if (pathname?.startsWith("/ciclo-proveedores")) return "Maestros";
  const item = ALL_NAV_ITEMS.find((i) => i.href !== "/agente-ia" && pathname?.startsWith(i.href));
  return item?.label || null;
}

// Botón flotante del Agente IA, visible en todas las secciones EXCEPTO la
// propia sección Agente IA (ahí ya está el chat completo). A diferencia de
// AgenteChat.jsx (chat completo, con historial de conversaciones persistente
// en el Sidebar), esta es una conversación nueva y efímera cada vez que se
// abre: igual de capaz (mismas herramientas, misma moderación — ver
// lib/aiChatCascade.js/agentTools.js), pero no aparece en el historial de la
// sección Agente IA ni se puede retomar después de cerrarla (ver
// backend/lib/conversations.js#listConversations, que filtra "model: widget").
// Nova en Bienestar: sin carrito, con un corazón en la mano. Cada cierto tiempo cambia de gesto (saluda, señala) y luego
// entra en meditación: ojos cerrados, flotando sobre un loto. Todo es CSS (ver .nova-bien en globals.css).
function NovaBienestar() {
  return (
    <span className="floating-agent-fab-icon nova-bien">
      <span className="nova-aura" /><span className="nova-aura dos" />
      <span className="nova-cuerpo">
        <img className="pose frente" src="/nova/nova-bienestar-frente.png" alt="" />
        <img className="pose saludo" src="/nova/nova-bienestar-saludo.png" alt="" />
        <img className="pose presenta" src="/nova/nova-bienestar-presentando.png" alt="" />
        <img className="pose medita" src="/nova/nova-bienestar-meditando.png" alt="" />
        <svg className="nova-corazon" viewBox="0 0 32 30" aria-hidden="true"><path d="M16 29C7 22 1 17 1 9.500 1 4.800 4.700 1 9.200 1 12 1 14.600 2.500 16 4.800 17.400 2.500 20 1 22.800 1 27.300 1 31 4.800 31 9.500 31 17 25 22 16 29Z" /></svg>
        <i className="nova-mini uno" /><i className="nova-mini dos" /><i className="nova-mini tres" />
      </span>
      <svg className="nova-loto" viewBox="0 0 80 30" aria-hidden="true">
        <path d="M40 28C30 26 25 18 40 2 55 18 50 26 40 28Z" /><path d="M36 28C24 28 15 20 18 8 28 11 36 18 36 28Z" /><path d="M44 28C56 28 65 20 62 8 52 11 44 18 44 28Z" /><path d="M32 29C20 31 8 26 3 17 15 15 27 20 32 29Z" /><path d="M48 29C60 31 72 26 77 17 65 15 53 20 48 29Z" />
      </svg>
    </span>
  );
}

export default function FloatingAgentChat({ user }) {
  const modulo = useModulo();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const textareaRef = useAutoGrow(input); // el campo crece al escribir, sin barra de desplazamiento
  const [sending, setSending] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const scrollRef = useRef(null);
  const closeTimerRef = useRef(null);
  // Dos preguntas de gerente al azar (se eligen al abrir, en el cliente, para no descuadrar el render del servidor).
  const [alAzar, setAlAzar] = useState([]);
  useEffect(() => {
    if (open) setAlAzar(preguntasAlAzar(modulo === "tesoreria" ? PREGUNTAS_TESORERIA : modulo === "bienestar" ? PREGUNTAS_BIENESTAR : PREGUNTAS_COMPRAS, 2).map((p) => p.prompt));
  }, [open, modulo]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open]);

  useEffect(() => () => clearTimeout(closeTimerRef.current), []);

  if (!user || !canViewAgenteIA(user.role) || pathname?.startsWith("/agente-ia")) {
    return null;
  }

  const section = sectionLabelFor(pathname);
  const userInitials = (user?.nombre || "?").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "?";

  function openPanel() {
    clearTimeout(closeTimerRef.current);
    setClosing(false);
    setOpen(true);
  }

  function closePanel() {
    setClosing(true);
    closeTimerRef.current = setTimeout(() => {
      setOpen(false);
      setClosing(false);
      setExpanded(false);
      // Efímera: al cerrar, la próxima apertura siempre arranca en blanco —
      // no hay forma de retomar esta conversación (ver comentario arriba).
      setMessages([]);
      setConversationId(null);
      setInput("");
    }, CLOSE_ANIM_MS);
  }

  // Empieza de cero SIN cerrar el panel (distinto de cerrarlo: el usuario
  // sigue viendo el widget abierto, solo se olvida el hilo actual).
  function newConversation() {
    setMessages([]);
    setConversationId(null);
    setInput("");
  }

  async function send(text) {
    const message = (text ?? input).trim();
    if (!message || sending) return;

    setMessages((prev) => [...prev, { role: "user", text: message }, { role: "model", text: "" }]);
    setInput("");
    setSending(true);

    try {
      const { text: reply, conversationId: newConvId } = await sendAgentChatApi({
        message, conversationId, section, widget: true, contexto: leerPantallaNova(),
      });
      if (newConvId && newConvId !== conversationId) setConversationId(newConvId);
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = { role: "model", text: reply };
        return next;
      });
    } catch (err) {
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = { role: "model", text: `⚠️ ${err.message || "No se pudo obtener respuesta."}` };
        return next;
      });
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  const isEmpty = messages.length === 0;

  return (
    <>
      {open && (
        <div className={`floating-agent-panel${closing ? "" : " is-open"}${expanded ? " is-expanded" : ""}`}>
          <div className="floating-agent-head">
            <div className="floating-agent-head-row">
              <div className="floating-agent-brand">
                <div className="floating-agent-mark"><IconSpark size={17} /></div>
                <div>
                  <div className="floating-agent-title">Nova</div>
                  <div className="floating-agent-status"><span className="floating-agent-status-dot" />En línea</div>
                </div>
              </div>
              <div className="floating-agent-actions">
                {!isEmpty && (
                  <button
                    type="button" className="floating-agent-new" onClick={newConversation}
                    title="Nueva conversación" aria-label="Nueva conversación"
                  >
                    <IconPlus size={13} />
                  </button>
                )}
                <button
                  type="button" className="floating-agent-expand" onClick={() => setExpanded((v) => !v)}
                  title={expanded ? "Volver al tamaño normal" : "Ampliar vista"}
                  aria-label={expanded ? "Volver al tamaño normal" : "Ampliar vista"}
                >
                  {expanded ? (
                    <svg width="13" height="13" viewBox="0 0 17 17" fill="none">
                      <path d="M2 6.5h4.5V2M15 6.5h-4.5V2M2 10.5h4.5V15M15 10.5h-4.5V15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    <svg width="13" height="13" viewBox="0 0 17 17" fill="none">
                      <path d="M6.5 2H2v4.5M10.5 2H15v4.5M6.5 15H2v-4.5M10.5 15H15v-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
                <button type="button" className="floating-agent-close" onClick={closePanel} title="Cerrar" aria-label="Cerrar">
                  <svg width="14" height="14" viewBox="0 0 17 17" fill="none"><path d="M3 3l11 11M14 3L3 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
                </button>
              </div>
            </div>
            {section && (
              <div className="floating-agent-chip">
                <svg width="12" height="12" viewBox="0 0 17 17" fill="none">
                  <rect x="1.5" y="1.5" width="6" height="6" rx="1.4" stroke="currentColor" strokeWidth="1.3" />
                  <rect x="9.5" y="1.5" width="6" height="6" rx="1.4" stroke="currentColor" strokeWidth="1.3" />
                  <rect x="1.5" y="9.5" width="6" height="6" rx="1.4" stroke="currentColor" strokeWidth="1.3" />
                  <rect x="9.5" y="9.5" width="6" height="6" rx="1.4" stroke="currentColor" strokeWidth="1.3" />
                </svg>
                {section}
              </div>
            )}
          </div>

          <div className="floating-agent-body" ref={scrollRef}>
            {isEmpty ? (
              <div className="floating-agent-empty">
                <div className="floating-agent-empty-mark"><IconSpark size={18} /></div>
                <p>
                  Pregúntame sobre los datos de compras{section ? <> o qué puedes hacer en <strong>{section}</strong></> : ""} — no
                  guardo esta conversación en tu historial.
                </p>
                <div className="floating-agent-suggestions">
                  {[PRIMERA, ...alAzar].map((s) => (
                    <button key={s} type="button" className="floating-agent-suggestion" onClick={() => send(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m, i) => (
                <div key={i} className={`floating-agent-msg ${m.role}`}>
                  <div className="floating-agent-msg-avatar">
                    {m.role === "user" ? userInitials : <IconSpark size={13} />}
                  </div>
                  <div className="floating-agent-msg-bubble">
                    {m.role === "model" && m.text === "" && sending && i === messages.length - 1 ? (
                      <span className="floating-agent-thinking">
                        <span className="floating-agent-typing"><span /><span /><span /></span>
                        <ThinkingLabel intervalMs={1500} />
                      </span>
                    ) : m.role === "model" ? (
                      <AssistantContent text={m.text} />
                    ) : (
                      <div className="chat-markdown">{m.text}</div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="floating-agent-input">
            <div className="floating-agent-input-row">
              <textarea
                ref={textareaRef}
                rows={1}
                placeholder={section ? `Pregunta algo sobre ${section}…` : "Pregunta algo…"}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={sending}
              />
              <button type="button" className="floating-agent-send" onClick={() => send()} disabled={sending || !input.trim()}>
                {sending ? <span className="spinner" /> : <IconSend size={14} />}
              </button>
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        className="floating-agent-fab"
        onClick={() => (open ? closePanel() : openPanel())}
        title="Nova"
        aria-label={open ? "Cerrar Nova" : "Abrir Nova"}
      >
        {/* Nova se queda igual (tamaño, posición, sin círculo) esté abierto o
            cerrado el panel — a propósito no hay un ícono de "×" ni un
            círculo de fondo que la reemplace al abrir. */}
        {modulo === "bienestar" ? <NovaBienestar /> : (
          <span className="floating-agent-fab-icon">
            <img className="nova-frente" src="/nova/nova-frente.png" alt="" />
            <img className="nova-saludo" src="/nova/nova-saludo.png" alt="" />
          </span>
        )}
      </button>
    </>
  );
}
