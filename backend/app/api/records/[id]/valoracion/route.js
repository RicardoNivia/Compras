import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-server";
import { isRoleAllowed } from "@/lib/permissions";
import { apiError } from "@/lib/apiGuard";
import { getValoracionDeRegistro, valorarRegistro } from "@/lib/valoraciones";

/**
 * @openapi
 * /api/records/{id}/valoracion:
 *   get:
 *     tags: [Registros]
 *     summary: Valoración con IA de una compra radicada (puntaje de la compra y del proveedor, con las observaciones de por qué). null si aún no se valoró.
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: "{ valoracion }" }
 *   post:
 *     tags: [Registros]
 *     summary: Genera (o vuelve a generar) con IA la valoración de una compra YA radicada, analizando todo el registro y las compras anteriores con el mismo proveedor, y la guarda. Se llama al radicar (requiere permiso "toggleRadicado" o "editRecord").
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: "{ valoracion }" }
 *       409: { description: "El registro no está radicado." }
 */
export async function GET(_request, { params }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  try {
    return NextResponse.json({ valoracion: await getValoracionDeRegistro(params.id) });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(_request, { params }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const permitido = (await isRoleAllowed(user.role, "toggleRadicado")) || (await isRoleAllowed(user.role, "editRecord"));
  if (!permitido) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  try {
    return NextResponse.json({ valoracion: await valorarRegistro(params.id, user, { origen: "radicacion" }) });
  } catch (err) {
    return apiError(err);
  }
}
