import swaggerJsdoc from "swagger-jsdoc";

// Spec OpenAPI generado a partir de los comentarios "@openapi" (formato YAML)
// puestos encima de cada route handler en app/api/** — ver cada route.js para
// el detalle de esa ruta. Solo se regenera cuando se pide (ver
// app/api/openapi.json/route.js), no en build time, así que un comentario mal
// formado se nota al consultar /docs, no rompe el build.
const options = {
  definition: {
    openapi: "3.0.3",
    info: {
      title: "Panel de Compras y Bienestar (Sinco) — API",
      version: "1.0.0",
      description:
        "API del backend del Panel de Compras y Bienestar. Todas las rutas (salvo /api/auth/login) requieren la cookie de sesión httpOnly \"session\" — inicia sesión desde la app (POST /api/auth/login) y el navegador la mandará automáticamente en cada request de este mismo origen. Para probar aquí mismo (\"Try it out\"), primero inicia sesión en la app en otra pestaña del mismo navegador.",
    },
    servers: [{ url: "/", description: "Mismo origen (backend, puerto 3001)" }],
    components: {
      securitySchemes: {
        sessionCookie: {
          type: "apiKey",
          in: "cookie",
          name: "session",
          description: "Cookie httpOnly firmada (ver lib/session.js) — se obtiene con POST /api/auth/login.",
        },
      },
      schemas: {
        Error: {
          type: "object",
          properties: { error: { type: "string" } },
        },
        Record: {
          type: "object",
          description: "Un registro de compra (ver lib/records.js#toClientRecord).",
          properties: {
            id: { type: "string" },
            localSeq: { type: "integer" },
            informe: { type: "string", nullable: true },
            fechaSolicitud: { type: "string", format: "date" },
            fechaEntrega: { type: "string", format: "date", nullable: true },
            area: { type: "string" },
            responsable: { type: "string" },
            estado: { type: "string" },
            categoria: { type: "string", nullable: true },
            descripcion: { type: "string" },
            medioPago: { type: "string", nullable: true },
            licitacion: { type: "string", nullable: true },
            estadoLegalizacion: { type: "string", nullable: true },
            proveedor: { type: "string", nullable: true },
            fe: { type: "string", nullable: true },
            valorConIva: { type: "number", nullable: true },
            valorSinIva: { type: "number", nullable: true },
            valorCot: { type: "number", nullable: true },
            moneda: { type: "string", enum: ["COP", "USD"] },
            valorUsd: { type: "number", nullable: true },
            trm: { type: "number", nullable: true },
            observaciones: { type: "string", nullable: true },
            radicado: { type: "boolean" },
            fechaRegistro: { type: "string", format: "date-time" },
          },
        },
        User: {
          type: "object",
          properties: {
            id: { type: "string" },
            nombre: { type: "string" },
            email: { type: "string", format: "email" },
            role: { type: "string", enum: ["admin", "registro", "legalizar", "radicar"] },
            activo: { type: "boolean" },
          },
        },
      },
    },
    security: [{ sessionCookie: [] }],
    tags: [
      { name: "Auth", description: "Sesión (login/logout/usuario actual/cambio de contraseña)." },
      { name: "Registros", description: "CRUD de registros de compra." },
      { name: "Usuarios", description: "Administración de cuentas (solo admin)." },
      { name: "Auditoría", description: "Historial de acciones sensibles (solo admin)." },
      { name: "Agente IA", description: "Chat y utilidades de IA (Anthropic) del Agente IA." },
      { name: "Alertas", description: "Solicitudes atrasadas, riesgo de presupuesto y de tiempos." },
      { name: "Presupuesto", description: "Presupuesto por área/año (solo admin)." },
      { name: "Maestros", description: "Listas de opciones de los formularios (solo admin)." },
      { name: "Proveedores", description: "Catálogo de proveedores (nit + nombre) para el autocompletar del formulario de registros (solo admin para escribir)." },
      { name: "Permisos", description: "Matriz de permisos por rol (solo admin)." },
      { name: "Informes", description: "Informes automáticos por correo (solo admin)." },
    ],
  },
  apis: ["./app/api/**/route.js"],
};

export function getOpenApiSpec() {
  return swaggerJsdoc(options);
}
