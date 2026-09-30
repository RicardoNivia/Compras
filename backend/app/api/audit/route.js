import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-server";
import { isRoleAllowed } from "@/lib/permissions";
import { listAuditLogs } from "@/lib/audit";

export async function GET(request) {
  const user = await getSessionUser();
  if (!user || !(await isRoleAllowed(user.role, "viewAuditoria"))) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") || undefined;
  const to = searchParams.get("to") || undefined;
  const userId = searchParams.get("userId") || undefined;
  const recordId = searchParams.get("recordId") || undefined;
  const page = parseInt(searchParams.get("page") || "1", 10) || 1;
  const pageSize = Math.min(200, parseInt(searchParams.get("pageSize") || "50", 10) || 50);

  const result = await listAuditLogs({ from, to, userId, recordId, page, pageSize });
  return NextResponse.json(result);
}
