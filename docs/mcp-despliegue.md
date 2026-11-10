# Conectar con Claude (MCP) — solo para administradores

Servidor MCP de **solo lectura** dentro del backend (`POST /api/mcp`) con tokens personales. Cada administrador crea un token en
**Conectar con Claude** y lo usa desde su propio Claude; el consumo de IA va a su cuenta, no a `ANTHROPIC_API_KEY`.

> **Solo el rol `admin` puede verlo y usarlo, en local y en producción.** No es un permiso de la Matriz de permisos: no se
> puede asignar a ningún otro rol (la funcionalidad `usarMcp` no existe y `POST /api/permissions` la rechaza con 400).

## Cómo se garantiza que solo sea de admin

La regla vive en `backend/lib/mcpGate.js#mcpPermitidoA(role)` (`role === "admin"`) y se aplica en todas las capas:

| Capa | Qué hace con un no-admin |
|---|---|
| Menú lateral | El ítem "Conectar con Claude" no aparece |
| Página `/conectar-claude` | `frontend/middleware.js` redirige a Registros (307) |
| `GET/POST /api/tokens`, `DELETE /api/tokens/{id}` | 403, y además `lib/mcpTokens.js` revalida el rol |
| `POST /api/mcp` | `authenticateBearer` devuelve `null` (401): un token de un usuario que no es admin no autentica, aunque exista en la BD |
| Matriz de permisos | No aparece como funcionalidad; no se puede asignar |

Si el dueño de un token deja de ser admin o se desactiva, el token deja de funcionar al instante.

## Infraestructura en Azure

No hay servicios nuevos. Corre en las mismas imágenes Docker que ya construye `azure-pipelines.yml`
(`sincodb/comprasapp-backend` y `sincodb/comprasapp-frontend`).

| Pieza | ¿Cambia? | Detalle |
|---|---|---|
| Base de datos | Tabla nueva `tokens_acceso` | La crea `prisma migrate deploy`, que el backend ya ejecuta al arrancar |
| Backend | No hay contenedor nuevo | `/api/mcp` y `/api/tokens` son rutas del mismo Next.js |
| Frontend | No | El `rewrites()` ya reenvía `/api/*`; la URL del MCP es `https://<dominio-del-panel>/api/mcp` |
| Variables de entorno | Ninguna | Los tokens no usan `SESSION_SECRET`; se validan contra la BD |
| Pipeline | No | Despliegue normal |

### Requisitos antes de usarlo en producción

1. **HTTPS obligatorio.** El token viaja en el encabezado `Authorization`; sin TLS se podría capturar.
2. **Alcance de red.** Claude Code y Claude Desktop se conectan desde el equipo del administrador: basta que llegue al dominio del panel (intranet o VPN).
3. **Proxy inverso:** debe dejar pasar `POST` con el encabezado `Authorization` y respuestas JSON normales (no hay streaming/SSE); un timeout de 60 s alcanza.
4. **Réplicas:** el límite de 60 consultas/min por persona es en memoria por proceso; con varias réplicas del backend el límite real se multiplica.
5. **Política de datos:** lo que Claude consulta sale hacia la cuenta de Claude del administrador (Anthropic). Confirma que esto cumple la política de datos de Sinco.

### No soportado

- **claude.ai en el navegador:** sus conectores personalizados usan OAuth, no tokens por encabezado. Habilitarlo requeriría OAuth 2.1 en el backend y exponer el panel a Internet.

## Conectar cada cliente

- **Claude Code**: `claude mcp add --transport http --scope user panel-compras https://<dominio>/api/mcp --header "Authorization: Bearer <token>"`
- **Claude Desktop** (requiere Node.js): en `claude_desktop_config.json`, la configuración con `mcp-remote` que muestra la página al crear el token. Reinicia Claude Desktop.

## Seguridad

- Solo se guarda el hash SHA-256 del token; se muestra una vez. Máx. 5 activos por persona, vigencia 30–365 días.
- Revocar es inmediato (el dueño o cualquier admin).
- Todo queda en Auditoría: creación/revocación de tokens y cada consulta (herramienta + filtros).
- Expone las mismas 12 herramientas de Nova (`lib/agentTools.js`), todas de lectura y con sus mismos permisos.
- Nova no responde preguntas sobre esta función (regla 13 de su prompt) y no ve estos movimientos en la auditoría.
