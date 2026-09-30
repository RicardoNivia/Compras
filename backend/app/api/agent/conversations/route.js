import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-server";
import { isRoleAllowed } from "@/lib/permissions";
import { listConversations } from "@/lib/conversations";

export async function GET() {
  const user = await getSessionUser();
  if (!user || !(await isRoleAllowed(user.role, "viewAgenteIA"))) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }
  const conversations = await listConversations(user.id);
  return NextResponse.json({ conversations });
}
