import { NextResponse } from "next/server";
import { getOpenApiSpec } from "@/lib/openapi";

// Spec OpenAPI consumido por /docs (Swagger UI) — acceso restringido a admin
// en middleware.js (expone la forma completa de la API). No es una API de
// negocio, por eso no está en lib/permissions.js como el resto.
export async function GET() {
  return NextResponse.json(getOpenApiSpec());
}
