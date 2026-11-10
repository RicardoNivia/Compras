# Fase 2: resumen diario de "Mi día" en Microsoft Teams

Estado: **pendiente de implementar**. La conexión con Teams se probó y funciona; falta construir la funcionalidad en la app.

## Contexto

La fase 1 dejó "Mi día y alertas" (`backend/lib/pendientes.js`, `/alertas`) como motor único de pendientes por rol. No tiene canal de correo a propósito: SMTP-AUTH está bloqueado (ver `MAIL_MAINTENANCE` en `backend/lib/mailer.js`). La fase 2 avisa por Teams para que la gente se entere sin entrar a la app.

## Cómo funciona la conexión (probado)

Se usa un **webhook de Power Automate (aplicación Flujos de trabajo / Workflows de Teams)**. No requiere permisos de IT ni registrar aplicaciones.

1. En Teams, aplicación *Flujos de trabajo*, plantilla **"Publicar en un chat cuando se recibe una solicitud de webhook"** (o la de canal).
2. El flujo genera una URL. Esa URL **es un secreto**: quien la tenga puede publicar en ese chat o canal.
3. La app hace `POST` a la URL con JSON UTF-8:

```json
{
  "type": "message",
  "attachments": [{
    "contentType": "application/vnd.microsoft.card.adaptive",
    "contentUrl": null,
    "content": {
      "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
      "type": "AdaptiveCard",
      "version": "1.2",
      "body": [ { "type": "TextBlock", "text": "..." } ]
    }
  }]
}
```

4. Respuesta esperada: **HTTP 202** (aceptado). Un 202 no garantiza la entrega: el flujo puede fallar después. Hay que revisar el historial de ejecuciones del flujo.

### Ajustes necesarios en el flujo (errores ya encontrados)

- La acción **"Post card in a chat or channel"** debe quedar así:
  - Publicar como: **Flow bot**
  - Publicar en: **Chat with Flow bot**
  - Recipient: correo de la persona (o un chat de grupo / canal)
  - Tarjeta adaptable: expresión `items('For_each')?['content']`
- El error `Call made for a thread which is not a ChatThread` significa que el destino es inválido (por ejemplo, un chat consigo mismo).
- Si el campo Tarjeta adaptable queda vacío, la acción sale como "Parámetros no válidos".
- El límite del cuerpo es 256 KB.
- Enviar siempre con `fetch` de Node o con la app, no con `curl` desde Git Bash en Windows: este último manda tildes en una codificación que no es UTF-8 y el webhook responde 400.

### Limitaciones a tener presentes

- El flujo **corre con la cuenta de quien lo creó**. Si esa persona se va, cambia de contraseña o se le desactiva la licencia, los envíos se detienen. Añadir **co-propietarios** a cada flujo (ya está Manuel Morales en el de prueba).
- La alternativa oficial (bot de Teams o Microsoft Graph) sí exige permisos de IT. No se eligió por eso.
- Los antiguos conectores de Office 365 están en retiro: no usarlos.

## Diseño propuesto

| Tema | Decisión propuesta |
|---|---|
| Destino | Un chat o canal **por rol**, cada uno con su propia URL de webhook. El mensaje personal a cada persona exigiría un flujo por persona y no escala. |
| Configuración | Pantalla solo para admin: URL por rol, interruptor activo/inactivo, hora de envío, botón **Enviar prueba**. |
| Horario | **Días hábiles** (calendario colombiano de `lib/businessDays.js`) a las **8:00 am**. |
| Contenido | Saludo, total de pendientes y de urgentes, los 3 a 5 más críticos y botón **Abrir Mi día** (`Action.OpenUrl` hacia `/alertas`). |
| Sin pendientes | **No se envía nada.** Debe poder cambiarse con una opción. |
| Secreto | La URL se guarda en base de datos. La pantalla solo muestra los últimos caracteres. Nunca va en el repositorio, en logs ni en auditoría. |

Preguntas que seguían abiertas al pausar: ¿un canal por rol o uno solo? ¿8:00 am está bien? ¿Con qué cuenta se crean los flujos de producción y quiénes serán co-propietarios?

## Plan de implementación

1. **Modelo** (migración con `prisma migrate dev`, id entero autoincremental): por ejemplo `TeamsDestino` con `rol`, `webhookUrl`, `activo`, `hora`, `soloSiHayPendientes`, `ultimoEnvioAt`, `ultimoEstado`, más `createdAt`, `creadoPorUserId`, `creadoPorNombre`. Respetar la convención de creador de `CLAUDE.md`.
2. **`backend/lib/teamsNotificaciones.js`**:
   - `construirTarjeta(rol, pendientes)` reutilizando `getPendientes` con un usuario representativo del rol. Para "Solo lo mío" no aplica: el resumen es del rol completo.
   - `enviarATeams(url, tarjeta)` con `fetch`, timeout y manejo de errores (no lanzar al scheduler).
   - `enviarPrueba(destino)`.
3. **Scheduler** en proceso, igual que `reportScheduler.js` (revisión cada minuto, sin cron externo): dispara a la hora configurada solo en días hábiles y evita doble envío el mismo día con `ultimoEnvioAt`. Arrancarlo desde `instrumentation.js`.
4. **API** `app/api/teams/*` protegida con `requirePermission`. Se sugiere una feature nueva `configTeams` (default: solo admin) en `lib/permissions.js`. Listar, crear y editar destinos, enviar prueba y borrar. La respuesta nunca devuelve la URL completa.
5. **Auditoría**: `logTeamsDestinoCreate/Update/Delete` en `backend/lib/audit.js`, mapa de etiquetas en `backend/lib/auditLabels.js` y su copia en `frontend/lib/auditLabels.js`, y entrada en `ENTITY_LABELS`. Enmascarar la URL en el diff. También auditar los envíos de prueba.
6. **Frontend**: sección dentro de Maestros o de Informes (decidir), con tabla paginada según la convención (Tamaño, Anterior/Siguiente, Página X de Y), modal de edición y botón Enviar prueba que muestre el resultado.
7. **Documentación**: actualizar `CLAUDE.md` (sección Mi día y alertas: quitar "Teams is the next phase") y `backend/lib/appGuide.js` para que Nova sepa responder sobre el tema.
8. **Verificación en producción**: confirmar que el servidor tiene salida a internet hacia `*.environment.api.powerplatform.com:443` antes de dar la funcionalidad por terminada.

## Limpieza pendiente de la prueba

- Borrar el flujo de prueba "Mi Dia" en Power Automate: su URL de webhook quedó escrita en el chat de la sesión y debe considerarse comprometida.
- Los flujos reales se crean de nuevo, uno por rol, con co-propietarios.
