import { NextResponse } from "next/server";
import { listRecords, createRecord, getMeta } from "@/lib/records";
import { getSessionUser } from "@/lib/auth-server";
import { canCreateRecord } from "@/lib/roles";

export async function GET() {
  const [records, meta] = await Promise.all([listRecords(), getMeta()]);
  return NextResponse.json({ records, meta });
}

export async function POST(request) {
  const user = await getSessionUser();
  if (!user || !canCreateRecord(user.role)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }
  try {
    const body = await request.json();
    const record = await createRecord(body, user);
    return NextResponse.json(record, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}
