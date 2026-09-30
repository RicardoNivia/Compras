import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-server";
import { isRoleAllowed } from "@/lib/permissions";
import { listAuditActors } from "@/lib/audit";

export async function GET() {
  const user = await getSessionUser();
  if (!user || !(await isRoleAllowed(user.role, "viewAuditoria"))) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const actors = await listAuditActors();
  return NextResponse.json({ actors });
}
