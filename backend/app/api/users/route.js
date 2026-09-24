import { NextResponse } from "next/server";
import { listUsers, createUser } from "@/lib/users";
import { getSessionUser } from "@/lib/auth-server";

// Protegido por middleware.js (solo rol "admin" llega hasta aquí).

export async function GET() {
  const users = await listUsers();
  return NextResponse.json({ users });
}

export async function POST(request) {
  try {
    const actor = await getSessionUser();
    const body = await request.json();
    const user = await createUser(body, actor);
    return NextResponse.json(user, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}
