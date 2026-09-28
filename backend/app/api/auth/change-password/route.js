import { NextResponse } from "next/server";
import { changeOwnPassword } from "@/lib/users";
import { getSessionUser } from "@/lib/auth-server";

// Protegido por middleware.js (requiere sesión válida; cualquier rol puede cambiar su propia contraseña).

export async function POST(request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "No autenticado." }, { status: 401 });
    }
    const body = await request.json().catch(() => ({}));
    await changeOwnPassword(user.id, body.currentPassword, body.newPassword);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}
