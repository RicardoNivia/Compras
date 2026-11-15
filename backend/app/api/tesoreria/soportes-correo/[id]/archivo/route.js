import { conTesoreria } from "@/lib/tesoreria/ruta";
import { archivoSoporteCorreo } from "@/lib/tesoreria/soportesCorreo";

/**
 * @openapi
 * /api/tesoreria/soportes-correo/{id}/archivo:
 *   get:
 *     tags: [Tesorería]
 *     summary: "El comprobante (PDF o foto) que llegó adjunto al correo (queda en auditoría). Nivel registro."
 */
export const GET = conTesoreria("registro", async ({ user, params }) => {
  const s = await archivoSoporteCorreo(user, params.id);
  return new Response(s.contenido, {
    headers: {
      "Content-Type": s.tipoMime || "application/octet-stream",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(s.archivoNombre || "soporte")}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
