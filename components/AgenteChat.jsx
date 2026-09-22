"use client";

import { useEffect, useRef, useState } from "react";
import { GEMINI_MODELS, DEFAULT_GEMINI_MODEL } from "@/lib/geminiModels";
import { renderMarkdown, splitChartBlocks } from "@/lib/markdown";
import ChartFromSpec from "@/components/charts/ChartFromSpec";
import { IconSpark, IconSend, IconPlus, IconTrash } from "@/components/icons";

const SUGGESTIONS = [
  "¿Cuál es el valor total de compras registrado?",
  "¿Cuáles son las 3 categorías con más gasto?",
  "Muéstrame un gráfico de compras por área",
  "¿Qué solicitudes llevan más días hábiles sin resolverse?",
];

function AssistantContent({ text }) {
  const parts = splitChartBlocks(text);
  return (
    <>
      {parts.map((part, i) =>
        part.type === "chart"
          ? <ChartFromSpec key={i} spec={part.spec} />
          : <div key={i} className="chat-markdown">{renderMarkdown(part.text)}</div>
      )}
    </>
  );
}

function formatConvDate(iso) {
  try {
    return new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
  } catch {
    return "";
  }
}

export default function AgenteChat({ userName }) {
  const [model, setModel] = useState(DEFAULT_GEMINI_MODEL);
  const [messages, setMessages] = useState([]); // { role: "user" | "model", text }
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [loadingConv, setLoadingConv] = useState(false);
  const [deletingConvId, setDeletingConvId] = useState(null);
  const scrollRef = useRef(null);
  const selectedModel = GEMINI_MODELS.find((m) => m.id === model);
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

    setMessages((prev) => [...prev, { role: "user", text: message }, { role: "model", text: "" }]);
    setInput("");
    setSending(true);

    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, message, conversationId }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Error ${res.status}`);
      }

      const newConvId = res.headers.get("X-Conversation-Id");
      if (newConvId && newConvId !== conversationId) setConversationId(newConvId);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        const snapshot = acc;
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: "model", text: snapshot };
          return next;
        });
      }
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
          {conversations.map((c) => (
            <div
              key={c.id}
              className={`agent-history-item${c.id === conversationId ? " active" : ""}`}
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
      </div>

      <div className="agent-chat">
        <div className="agent-chat-top">
          <div className="field" style={{ minWidth: 260 }}>
            <label htmlFor="agent-model">Modelo</label>
            <select id="agent-model" value={model} onChange={(e) => setModel(e.target.value)} disabled={sending}>
              {GEMINI_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} · {m.tier === "free" ? "Gratis" : "De pago"}
                </option>
              ))}
            </select>
          </div>
          {selectedModel && (
            <div className="agent-model-info">
              <span className={`pill ${selectedModel.tier === "free" ? "good" : "warning"}`}>
                {selectedModel.tier === "free" ? "Nivel gratuito disponible" : "Solo de pago"}
              </span>
              <span className="agent-model-desc">{selectedModel.description} · {selectedModel.limits}</span>
            </div>
          )}
        </div>

        <div className="agent-chat-scroll" ref={scrollRef}>
          {loadingConv ? (
            <div className="agent-empty"><span className="spinner" /></div>
          ) : isEmpty ? (
            <div className="agent-empty">
              <div className="agent-empty-mark"><IconSpark size={22} /></div>
              <h2>Hola{userName ? `, ${userName.split(" ")[0]}` : ""}. Soy el Agente IA de Compras.</h2>
              <p>Respondo preguntas basadas únicamente en los datos de compras registrados — no invento información y no puedo crear ni modificar registros.</p>
              <div className="agent-suggestions">
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" className="agent-suggestion-chip" onClick={() => send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="agent-messages">
              {messages.map((m, i) => (
                <div key={i} className={`agent-msg ${m.role}`}>
                  <div className="agent-msg-avatar">
                    {m.role === "user" ? userInitials : <IconSpark size={14} />}
                  </div>
                  <div className="agent-msg-bubble">
                    {m.role === "model" && m.text === "" && sending && i === messages.length - 1 ? (
                      <span className="agent-typing"><span /><span /><span /></span>
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

        <div className="agent-chat-input">
          <textarea
            rows={1}
            placeholder="Pregunta algo sobre los datos de compras…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={sending}
          />
          <button type="button" className="btn btn-primary agent-send-btn" onClick={() => send()} disabled={sending || !input.trim()}>
            {sending ? <span className="spinner" /> : <IconSend size={15} />}
          </button>
        </div>
      </div>
    </div>
  );
}
