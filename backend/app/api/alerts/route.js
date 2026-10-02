import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-server";
import { isRoleAllowed } from "@/lib/permissions";
import { getAlertsData } from "@/lib/alerts";

export async function GET() {
  const user = await getSessionUser();
  if (!user || !(await isRoleAllowed(user.role, "viewAlertas"))) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }
  const data = await getAlertsData();
  return NextResponse.json(data);
}
