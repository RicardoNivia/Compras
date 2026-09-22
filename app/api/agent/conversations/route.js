import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-server";
import { canViewAgenteIA } from "@/lib/roles";
import { listConversations } from "@/lib/conversations";

export async function GET() {
  const user = await getSessionUser();
  if (!user || !canViewAgenteIA(user.role)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }
  const conversations = await listConversations(user.id);
  return NextResponse.json({ conversations });
}
