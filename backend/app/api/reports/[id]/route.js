import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-server";
import { isRoleAllowed } from "@/lib/permissions";
import { updateReport, deleteReport } from "@/lib/reports";

async function guard() {
  const user = await getSessionUser();
  if (!user || !(await isRoleAllowed(user.role, "viewReportes"))) return null;
  return user;
}

export async function PATCH(request, { params }) {
  const user = await guard();
  if (!user) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  try {
    const body = await request.json();
    const report = await updateReport(params.id, body, user);
    return NextResponse.json(report);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}

export async function DELETE(request, { params }) {
  const user = await guard();
  if (!user) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  try {
    await deleteReport(params.id, user);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}
