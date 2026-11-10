import { conTesoreria } from "@/lib/tesoreria/ruta";
import { descargarSoporte, borrarSoporte } from "@/lib/tesoreria/soportes";

/**
 * @openapi
 * /api/tesoreria/soportes/{id}:
 *   get:
 *     tags: [Tesorería]
 *     summary: "Descarga un soporte (queda en auditoría)."
 *   delete:
 *     tags: [Tesorería]
 *     summary: "Quita un soporte (nivel registro; no en un mes firmado)."
 */
export const GET = conTesoreria("consulta", async ({ user, params }) => {
  const s = await descargarSoporte(user, params.id);
  return new Response(s.contenido, {
    headers: {
      "Content-Type": s.tipoMime,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(s.nombre)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
export const DELETE = conTesoreria("registro", ({ user, params }) => borrarSoporte(user, params.id));
