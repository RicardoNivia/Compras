import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-server";
import { isRoleAllowed } from "@/lib/permissions";
import { listReports, createReport } from "@/lib/reports";

async function guard() {
  const user = await getSessionUser();
  if (!user || !(await isRoleAllowed(user.role, "viewReportes"))) return null;
  return user;
}

export async function GET() {
  const user = await guard();
  if (!user) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const reports = await listReports();
  return NextResponse.json({ reports });
}

export async function POST(request) {
  const user = await guard();
  if (!user) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  try {
    const body = await request.json();
    const report = await createReport(body, user);
    return NextResponse.json(report, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}
