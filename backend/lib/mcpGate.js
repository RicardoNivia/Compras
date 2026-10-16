// La conexión con Claude (servidor MCP + tokens personales) es SOLO para desarrollo local: en producción
// (NODE_ENV=production, que fijan los Dockerfile) no existe — sus rutas responden 404, no aparece en la
// Matriz de permisos y sus tokens no autentican. No hay variable para activarla en producción a propósito.
export const MCP_HABILITADO = process.env.NODE_ENV !== "production";

// Además de ser solo local, la conexión con Claude es exclusiva de los usuarios admin (no es un permiso de la Matriz: el rol se valida directamente).
export const mcpPermitidoA = (role) => MCP_HABILITADO && role === "admin";

export function mcpNoDisponible() {
  return new Response(null, { status: 404 });
}
