import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-server";
import { canViewAgenteIA } from "@/lib/roles";
import { getConversation, deleteConversation } from "@/lib/conversations";

export async function GET(_request, { params }) {
  const user = await getSessionUser();
  if (!user || !canViewAgenteIA(user.role)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }
  const conversation = await getConversation(user.id, params.id);
  if (!conversation) {
    return NextResponse.json({ error: "Conversación no encontrada." }, { status: 404 });
  }
  return NextResponse.json(conversation);
}

export async function DELETE(_request, { params }) {
  const user = await getSessionUser();
  if (!user || !canViewAgenteIA(user.role)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }
  try {
    await deleteConversation(user.id, params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}
