import { NextResponse } from "next/server";
import { apiError } from "@/lib/apiGuard";
import { requireTesoreria } from "@/lib/tesoreria/comun";
import { MAX_BYTES_ARCHIVO } from "@/lib/archivoSeguro";

// Envoltorio de las rutas /api/tesoreria/*: valida el acceso nominal y el nivel, y responde JSON o el error con su status.
// fn recibe { request, params, user, acceso, query, body } (body solo para JSON).
export function conTesoreria(nivel, fn) {
  return async function handler(request, ctx) {
    const { user, acceso, denied } = await requireTesoreria(nivel);
    if (denied) return denied;
    try {
      const query = Object.fromEntries(new URL(request.url).searchParams);
      const esJson = (request.headers.get("content-type") || "").includes("application/json");
      const body = esJson ? await request.json().catch(() => ({})) : undefined;
      const r = await fn({ request, params: ctx?.params || {}, user, acceso, query, body });
      return r instanceof Response ? r : NextResponse.json(r);
    } catch (err) {
      return apiError(err);
    }
  };
}

// Archivo de un multipart (campo `campo`), con el límite de 10 MB del resto de la app.
export async function archivoDe(form, campo = "archivo") {
  const a = form.get(campo);
  if (!a || typeof a === "string" || !a.size) return null;
  if (a.size > MAX_BYTES_ARCHIVO) throw Object.assign(new Error(`No se acepta «${a.name}»: pasa de 10 MB.`), { status: 400 });
  return { nombre: a.name || "archivo", buffer: Buffer.from(await a.arrayBuffer()) };
}
