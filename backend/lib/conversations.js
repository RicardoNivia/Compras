import { prisma } from "@/lib/prisma";

const TITLE_MAX = 60;

export function makeTitle(text) {
  const t = (text || "").trim().replace(/\s+/g, " ");
  if (!t) return "Nueva conversación";
  return t.length > TITLE_MAX ? `${t.slice(0, TITLE_MAX)}…` : t;
}

// "model: widget" son conversaciones efímeras del botón flotante de Agente IA
// (ver FloatingAgentChat.jsx) — existen en la base de datos (para que el
// historial de esa sesión de widget funcione igual de confiable que el chat
// completo, sin confiar en nada que mande el cliente), pero nunca se listan
// acá: no deben aparecer ni poder retomarse desde la sección Agente IA.
export async function listConversations(userId) {
  const conversations = await prisma.conversation.findMany({
    where: { userId, model: { not: "widget" } },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, model: true, createdAt: true, updatedAt: true },
  });
  return conversations;
}

export async function getConversation(userId, id) {
  const conversation = await prisma.conversation.findFirst({
    where: { id, userId },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!conversation) return null;
  return {
    id: conversation.id,
    title: conversation.title,
    model: conversation.model,
    messages: conversation.messages.map((m) => ({ role: m.role, text: m.text })),
  };
}

export async function createConversation(userId, { title, model } = {}) {
  return prisma.conversation.create({
    data: { userId, title: title || null, model: model || null },
  });
}

// Verifica que la conversación pertenezca al usuario antes de tocarla.
async function assertOwnership(userId, conversationId) {
  const conv = await prisma.conversation.findFirst({ where: { id: conversationId, userId } });
  if (!conv) {
    const err = new Error("Conversación no encontrada.");
    err.status = 404;
    throw err;
  }
  return conv;
}

export async function appendMessages(userId, conversationId, messages) {
  await assertOwnership(userId, conversationId);
  await prisma.message.createMany({
    data: messages.map((m) => ({ conversationId, role: m.role, text: m.text })),
  });
  await prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
}

export async function renameConversation(userId, conversationId, title) {
  await assertOwnership(userId, conversationId);
  return prisma.conversation.update({ where: { id: conversationId }, data: { title } });
}

export async function deleteConversation(userId, conversationId) {
  await assertOwnership(userId, conversationId);
  await prisma.conversation.delete({ where: { id: conversationId } });
}
