"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { sendAgentChatApi } from "@/lib/api";
import AssistantContent, { ThinkingLabel } from "@/components/AgentMessageContent";
import { IconSend, IconPlus, IconTrash } from "@/components/icons";

// Barra de entrada compartida entre el estado "vacío" (centrada, junto al
// saludo) y el estado "con mensajes" (pegada abajo) — mismo markup en ambos
// casos para que la View Transition (ver handleSend) la reconozca como el
// mismo elemento y anime su cambio de posición en vez de solo reemplazarla.
function ChatInputBar({ input, setInput, onSend, onKeyDown, sending, placeholder }) {
  return (
    <div className="agent-chat-input agent-input-vt">
      <textarea
        rows={1}
        placeholder={placeholder}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={onKeyDown}
        disabled={sending}
      />
      <button type="button" className="btn btn-primary agent-send-btn" onClick={onSend} disabled={sending || !input.trim()}>
        {sending ? <span className="spinner" /> : <IconSend size={15} />}
      </button>
    </div>
  );
}

const SUGGESTIONS = [
  { prompt: "¿Cuál es el valor total de compras registrado?", title: "Valor total de compras", sub: "Cifra exacta sobre el 100% de los registros", icon: "money" },
  { prompt: "Muéstrame un gráfico de compras por área", title: "Gráfico por área", sub: "Desglose visual con datos reales", icon: "chart" },
  { prompt: "¿A partir de qué monto se requiere cuadro comparativo?", title: "Procedimiento de compras", sub: "Umbrales, aprobaciones y plazos", icon: "doc" },
  { prompt: "¿Qué puedo hacer en esta aplicación según mi rol?", title: "Qué puedo hacer aquí", sub: "Según tu rol en la aplicación", icon: "user" },
];

const SUGGESTION_ICONS = {
  money: <path d="M8.5 1v15M3 5.5c0-1.4 2.5-2.5 5.5-2.5s5.5 1.1 5.5 2.5-2.5 2.5-5.5 2.5S3 9.4 3 10.8s2.5 2.5 5.5 2.5 5.5-1.1 5.5-2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />,
  chart: <><rect x="2" y="9" width="3" height="6" stroke="currentColor" strokeWidth="1.2" /><rect x="7" y="5" width="3" height="10" stroke="currentColor" strokeWidth="1.2" /><rect x="12" y="2" width="3" height="13" stroke="currentColor" strokeWidth="1.2" /></>,
  doc: <><rect x="2" y="2" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.2" /><path d="M2 6.5h13" stroke="currentColor" strokeWidth="1.2" /></>,
  user: <><circle cx="8.5" cy="5.5" r="3" stroke="currentColor" strokeWidth="1.2" /><path d="M2.5 15c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="currentColor" strokeWidth="1.2" /></>,
};

function SuggestionIcon({ name }) {
  return <svg width="15" height="15" viewBox="0 0 17 17" fill="none">{SUGGESTION_ICONS[name]}</svg>;
}

function formatConvDate(iso) {
  try {
    return new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
  } catch {
    return "";
  }
}

// Agrupa el historial por fecha relativa a hoy — "Hoy / Ayer / Esta semana /
// Anteriores" en vez de una lista plana, igual que la propuesta de diseño.
function groupConversationsByDate(conversations) {
  const now = new Date();
  const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const today = startOf(now);
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const weekAgo = new Date(today); weekAgo.setDate(today.getDate() - 7);

  const groups = [
    { label: "Hoy", items: [] },
    { label: "Ayer", items: [] },
    { label: "Esta semana", items: [] },
    { label: "Anteriores", items: [] },
  ];
  for (const c of conversations) {
    const d = startOf(new Date(c.updatedAt));
    if (d.getTime() === today.getTime()) groups[0].items.push(c);
    else if (d.getTime() === yesterday.getTime()) groups[1].items.push(c);
    else if (d > weekAgo) groups[2].items.push(c);
    else groups[3].items.push(c);
  }
  return groups.filter((g) => g.items.length > 0);
}

export default function AgenteChat({ userName }) {
  const [messages, setMessages] = useState([]); // { role: "user" | "model", text }
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [loadingConv, setLoadingConv] = useState(false);
  const [deletingConvId, setDeletingConvId] = useState(null);
  const scrollRef = useRef(null);
  const userInitials = (userName || "?").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "?";

  useEffect(() => {
    refreshConversations();
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  async function refreshConversations() {
    try {
      const res = await fetch("/api/agent/conversations");
      const data = await res.json().catch(() => ({}));
      if (res.ok) setConversations(data.conversations || []);
    } catch {
      // silencioso: el historial es un extra, no bloquea el chat
    }
  }

  function startNewConversation() {
    setConversationId(null);
    setMessages([]);
    setInput("");
  }

  async function openConversation(id) {
    if (id === conversationId) return;
    setLoadingConv(true);
    try {
      const res = await fetch(`/api/agent/conversations/${id}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setConversationId(id);
        setMessages(data.messages || []);
      }
    } finally {
      setLoadingConv(false);
    }
  }

  async function handleDeleteConversation(id, e) {
    e.stopPropagation();
    setDeletingConvId(id);
    try {
      const res = await fetch(`/api/agent/conversations/${id}`, { method: "DELETE" });
      if (res.ok) {
        setConversations((prev) => prev.filter((c) => c.id !== id));
        if (id === conversationId) startNewConversation();
      }
    } finally {
      setDeletingConvId(null);
    }
  }

  async function send(text) {
    const message = (text ?? input).trim();
    if (!message || sending) return;

    // Primer mensaje de una conversación nueva: la barra pasa de estar
    // centrada (junto al saludo, ver isEmpty abajo) a quedar pegada abajo —
    // con la View Transition API ese cambio de posición se anima solo (el
    // navegador interpola entre el "antes" y el "después" de este mismo
    // elemento, identificado por view-transition-name en .agent-input-vt),
    // en vez de verse como un salto brusco. flushSync fuerza que React ya
    // haya actualizado el DOM antes de que el navegador capture el "después"
    // (la API necesita que el cambio ya esté aplicado de forma síncrona).
    const applyFirstMessage = () => {
      setMessages((prev) => [...prev, { role: "user", text: message }, { role: "model", text: "" }]);
      setInput("");
      setSending(true);
    };
    if (isEmpty && document.startViewTransition) {
      document.startViewTransition(() => flushSync(applyFirstMessage));
    } else {
      applyFirstMessage();
    }

    try {
      const { text: reply, conversationId: newConvId } = await sendAgentChatApi({ message, conversationId });
      if (newConvId && newConvId !== conversationId) setConversationId(newConvId);
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = { role: "model", text: reply };
        return next;
      });
      refreshConversations();
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
    <div className="agent-layout">
      <div className="agent-history">
        <button type="button" className="agent-new-chat-btn" onClick={startNewConversation}>
          <IconPlus size={13} /> Nueva conversación
        </button>
        <div className="agent-history-list">
          {conversations.length === 0 && <div className="agent-history-empty">Sin conversaciones aún.</div>}
          {groupConversationsByDate(conversations).map((group) => (
            <div key={group.label} className="agent-history-group">
              <div className="agent-history-group-label">{group.label}</div>
              {group.items.map((c, i) => (
                <div
                  key={c.id}
                  className={`agent-history-item${c.id === conversationId ? " active" : ""}`}
                  style={{ animationDelay: `${Math.min(i, 8) * 0.03}s` }}
                  onClick={() => openConversation(c.id)}
                >
                  <span className="agent-history-title">{c.title || "Nueva conversación"}</span>
                  <span className="agent-history-date">{formatConvDate(c.updatedAt)}</span>
                  <button
                    type="button" className="agent-history-del"
                    onClick={(e) => handleDeleteConversation(c.id, e)}
                    disabled={deletingConvId === c.id}
                    title="Eliminar conversación"
                  >
                    {deletingConvId === c.id ? <span className="spinner" /> : <IconTrash size={11} />}
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="agent-chat">

        <div className="agent-chat-scroll" ref={scrollRef}>
          {loadingConv ? (
            <div className="agent-hero-centered"><span className="spinner" /></div>
          ) : isEmpty ? (
            <div className="agent-hero-centered">
              <div className="agent-empty">
                <div className="agent-empty-mark"><img src="/nova/nova-saludo.png" alt="" /></div>
                <h2>Hola{userName ? `, ${userName.split(" ")[0]}` : ""}. Soy Nova, tu asistente de IA de compras.</h2>
                <p>Respondo preguntas sobre los datos de compras, el procedimiento oficial de compras (ADM-P-01) y cómo usar esta aplicación según tu rol — no invento información y no puedo crear, modificar ni aprobar nada.</p>
              </div>
              <ChatInputBar
                input={input} setInput={setInput} sending={sending}
                onSend={() => send()} onKeyDown={handleKeyDown}
                placeholder="Pregunta algo sobre los datos de compras…"
              />
              <div className="agent-suggestions">
                {SUGGESTIONS.map((s, i) => (
                  <button
                    key={s.prompt} type="button" className="agent-suggestion-card"
                    style={{ animationDelay: `${i * 0.05}s` }}
                    onClick={() => send(s.prompt)}
                  >
                    <span className="agent-suggestion-ic"><SuggestionIcon name={s.icon} /></span>
                    <span>
                      <span className="agent-suggestion-title">{s.title}</span>
                      <span className="agent-suggestion-sub">{s.sub}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="agent-messages">
              {messages.map((m, i) => (
                <div key={i} className={`agent-msg ${m.role}`}>
                  <div className="agent-msg-avatar">
                    {m.role === "user" ? userInitials : <img src="/nova/nova-face.png" alt="" />}
                  </div>
                  <div className="agent-msg-bubble">
                    {m.role === "model" && m.text === "" && sending && i === messages.length - 1 ? (
                      <span className="agent-thinking">
                        <img src="/nova/nova-pensando-face.png" alt="" className="agent-thinking-nova" />
                        <ThinkingLabel />
                      </span>
                    ) : m.role === "model" ? (
                      <AssistantContent text={m.text} />
                    ) : (
                      <div className="chat-markdown">{m.text}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {!isEmpty && !loadingConv && (
          <ChatInputBar
            input={input} setInput={setInput} sending={sending}
            onSend={() => send()} onKeyDown={handleKeyDown}
            placeholder="Pregunta algo sobre los datos de compras…"
          />
        )}
      </div>
    </div>
  );
}
