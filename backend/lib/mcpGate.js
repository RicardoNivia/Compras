// La conexión con Claude (servidor MCP + tokens personales) es exclusiva de los usuarios admin, en local y en producción.
// No es un permiso de la Matriz de permisos (no se puede asignar a otro rol): el rol se valida directamente aquí.
export const mcpPermitidoA = (role) => role === "admin";

export function mcpNoDisponible() {
  return new Response(null, { status: 404 });
}
