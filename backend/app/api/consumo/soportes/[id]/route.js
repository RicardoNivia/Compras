import { conConsumo } from "@/lib/consumo/ruta";
import { descargarSoporte, borrarSoporte } from "@/lib/consumo/recibos";

/**
 * @openapi
 * /api/consumo/soportes/{id}:
 *   get:
 *     tags: [Consumo]
 *     summary: "Abre el soporte de un recibo (PDF o imagen)."
 *   delete:
 *     tags: [Consumo]
 *     summary: "Quita el soporte de un recibo."
 */
export const GET = conConsumo("consulta", async ({ params }) => {
  const s = await descargarSoporte(params.id);
  return new Response(s.contenido, {
    headers: {
      "Content-Type": s.tipoMime,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(s.nombre)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
export const DELETE = conConsumo("registro", ({ user, params }) => borrarSoporte(user, params.id));
