import { NextResponse } from "next/server";
import { getFullMatrix, setPermission, isRoleAllowed } from "@/lib/permissions";
import { getSessionUser } from "@/lib/auth-server";

// La propia Matriz de permisos se administra desde la sección Usuarios, así
// que se gatea con la misma funcionalidad "viewUsuarios" (dinámica, no un
// role === "admin" fijo) para quedar consistente con el resto de la matriz.
export async function GET() {
  const user = await getSessionUser();
  if (!user || !(await isRoleAllowed(user.role, "viewUsuarios"))) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }
  const matrix = await getFullMatrix();
  return NextResponse.json({ matrix });
}

export async function POST(request) {
  const user = await getSessionUser();
  if (!user || !(await isRoleAllowed(user.role, "viewUsuarios"))) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }
  try {
    const body = await request.json();
    const row = await setPermission(body, user);
    return NextResponse.json(row);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}
