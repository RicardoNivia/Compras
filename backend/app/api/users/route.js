import { NextResponse } from "next/server";
import { listUsers, createUser } from "@/lib/users";

// Protegido por middleware.js (solo rol "admin" llega hasta aquí).

export async function GET() {
  const users = await listUsers();
  return NextResponse.json({ users });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const user = await createUser(body);
    return NextResponse.json(user, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}
