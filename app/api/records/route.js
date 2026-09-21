import { NextResponse } from "next/server";
import { listRecords, createRecord, getMeta } from "@/lib/records";

export async function GET() {
  const [records, meta] = await Promise.all([listRecords(), getMeta()]);
  return NextResponse.json({ records, meta });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const record = await createRecord(body);
    return NextResponse.json(record, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}
