import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-server";
import { canViewAuditoria } from "@/lib/roles";
import { listAuditActors } from "@/lib/audit";

export async function GET() {
  const user = await getSessionUser();
  if (!user || !canViewAuditoria(user.role)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const actors = await listAuditActors();
  return NextResponse.json({ actors });
}
