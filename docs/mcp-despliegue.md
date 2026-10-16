# Conectar con Claude (MCP) — solo desarrollo local

Servidor MCP de **solo lectura** dentro del backend (`POST /api/mcp`) con tokens personales. Cada persona crea un token en
**Conectar con Claude** y lo usa desde su propio Claude; el consumo de IA va a su cuenta, no a `ANTHROPIC_API_KEY`.

> **Esta función existe únicamente en local y solo para usuarios admin.** En producción no se ve ni responde, por ningún motivo.

## Cómo se garantiza que no exista en producción

La compuerta es `MCP_HABILITADO = process.env.NODE_ENV !== "production"` (`backend/lib/mcpGate.js`). Los dos
Dockerfile fijan `NODE_ENV=production` en la imagen final, así que no hay nada que configurar en Azure. **No existe
una variable para activarla en producción, a propósito.**

| Capa | En producción |
|---|---|
| `POST/GET /api/mcp`, `/api/tokens`, `/api/tokens/{id}` | Responden **404** |
| `middleware.js` | `/api/mcp` ya no es ruta pública (exigiría cookie de sesión) |
| `authenticateBearer` | Devuelve `null`: ningún token autentica, aunque exista en la BD |
| Matriz de permisos | No es un permiso configurable: se valida el rol `admin` directamente (un no-admin no la ve, no crea tokens y sus tokens no autentican) |
| Menú lateral y página `/conectar-claude` | El ítem no se muestra y la página responde 404 |
| Auditoría | Las entidades y acciones de MCP no aparecen en los filtros |

Lo único que llega a producción es la tabla `tokens_acceso` (la crea `prisma migrate deploy` junto con el resto de migraciones). Queda vacía y sin uso.

## Infraestructura en Azure

Ninguna: no hay servicios, variables ni cambios de pipeline para esta función.

## Uso en local

1. Levanta backend (3001) y frontend (3000).
2. En el panel: **Conectar con Claude → Crear token**.
3. **Claude Code**: `claude mcp add --transport http --scope user panel-compras http://localhost:3000/api/mcp --header "Authorization: Bearer <token>"`
4. **Claude Desktop** (requiere Node.js): en `claude_desktop_config.json`, la configuración con `mcp-remote` que muestra la página al crear el token. Reinicia Claude Desktop.

## Seguridad (en local)

- Solo se guarda el hash SHA-256 del token; se muestra una vez. Máx. 5 activos por persona, vigencia 30–365 días.
- Revocar es inmediato. Desactivar al usuario o quitarle `usarMcp` en la Matriz invalida sus tokens.
- Todo queda en Auditoría: creación/revocación de tokens y cada consulta (herramienta + filtros).
- Expone las mismas 12 herramientas de Nova (`lib/agentTools.js`), todas de lectura y con sus mismos permisos.
- Si algún día se quisiera llevar a producción, antes habría que resolver: política de datos (la información sale hacia la cuenta de Claude de cada persona), HTTPS, límite de consultas compartido entre réplicas y, para claude.ai web, OAuth. Hoy no se contempla.
