# Correo vinculado y agente de solicitudes de proveedor

Cada persona con el permiso **Vincular mi correo** (Matriz › General › Mi correo; por defecto Administrador y Proveedores) puede conectar su correo de Microsoft 365 desde **Mi correo** (`/mi-correo`). A partir de ahí, el agente de correo:

1. Cada 10 minutos lee los correos nuevos de su **Bandeja de entrada**. El permiso es de solo lectura (`Mail.Read`): no puede enviar, mover ni borrar.
2. Un filtro en código descarta lo que no habla de registrar un proveedor, sin usar IA. Pasa lo que menciona SRM, o "proveedor" junto a registrar, crear, inscribir, vincular, alta o nuevo, o lo que trae un RUT.
3. Nova lee cada correo que pasa el filtro junto con su adjunto (el RUT en PDF o foto: de ahí salen el NIT y la razón social). Escoge el tipo de servicio, la criticidad, la clasificación por monto y el área entre los valores de Maestros.
4. Deja un aviso en la **Bandeja** de esa persona:
   - **Completa** (NIT válido y no registrado, razón social y descripción): botón **Agregar proveedor**, que lo registra con un clic.
   - **Falta algo**: **Completar y agregar** abre el formulario de proveedor precargado, con los campos que faltan en rojo.
   - **El NIT ya existe**: enlace al proveedor existente.
   - Siempre se puede **Descartar** (con motivo opcional) o **Abrir en Outlook**.

Nunca se crea un proveedor sin que una persona lo confirme. Aprobar usa `createProveedor`, con las mismas validaciones, la misma auditoría y el mismo ciclo que el formulario.

## Configuración para TI (Microsoft Entra ID)

1. **Entra ID › Registros de aplicaciones › Nuevo registro**
   - Nombre: `Panel de Compras y Bienestar – correo`.
   - Tipos de cuenta: *Solo cuentas de este directorio organizativo* (un solo inquilino).
   - URI de redirección (Web): `https://<dominio del panel>/api/correo/callback`. En local: `http://localhost:3000/api/correo/callback`.
2. **Permisos de API › Microsoft Graph › Permisos delegados**: `Mail.Read`, `User.Read`, `offline_access`, `openid`, `email`. Después, **Conceder consentimiento de administrador** para el inquilino. Sin esto, cada persona vería "necesita aprobación de un administrador".
3. **Certificados y secretos › Nuevo secreto de cliente**: anotar el valor (vence; renovarlo antes de la fecha).
4. En el backend (Azure App Service › Configuración), definir:

| Variable | Valor |
|---|---|
| `CORREO_MODO` | `real` (`simulado` en local, para probar sin Microsoft) |
| `MS_GRAPH_TENANT_ID` | Id. de directorio (inquilino) |
| `MS_GRAPH_CLIENT_ID` | Id. de aplicación (cliente) |
| `MS_GRAPH_CLIENT_SECRET` | El secreto del paso 3 |
| `CORREO_CLAVE_CIFRADO` | Una cadena larga y aleatoria. Cifra los tokens guardados; si cambia, todos deben volver a vincular |
| `APP_URL` | La dirección del panel (ya existe por Teams) |
| `MS_GRAPH_REDIRECT_URI` | Opcional: por defecto `APP_URL/api/correo/callback` |
| `CORREO_AGENTE_AUTO` | `0` apaga la revisión automática (queda "Revisar ahora") |

No se usan permisos de aplicación, solo delegados: el panel solo lee el buzón de quien inició sesión y lo autorizó. Además, solo se acepta el buzón con el mismo correo del usuario del panel.

## Seguridad

- Los tokens se guardan cifrados (AES-256-GCM, `lib/cifradoTokens.js`). Nunca salen al cliente, a los logs ni a la auditoría. Desvincular los borra.
- `state` firmado con la sesión, más un nonce en una cookie httpOnly de 10 minutos, contra CSRF en la vuelta de Microsoft.
- El texto del correo y del adjunto son datos para Nova, nunca instrucciones. Los valores de maestros que devuelve se validan contra el catálogo en código.
- Los adjuntos pasan por `prepararArchivo` (se rechazan los PDF con JavaScript, acciones de apertura, archivos incrustados o formularios activos). No se guardan: solo su nombre.
- Del correo solo se guarda lo que forma la solicitud (remitente, asunto, datos extraídos, enlace a Outlook). De los demás correos solo queda el id del mensaje analizado (`correos_revisados`, para no pagar dos veces la misma lectura).
- El agente solo revisa buzones de personas activas que además tengan `editProveedores`.
- Auditoría: `cuentaCorreo` (vincular, desvincular, encender o apagar el agente) y `solicitudProveedorCorreo` (detectar, aprobar, descartar).

## Probar en local

Con `CORREO_MODO=simulado` en `backend/.env`, en Mi correo:

1. "Vincular (modo de prueba)" vincula sin Microsoft.
2. "Probar con un correo" procesa un correo pegado, con un RUT adjunto opcional, igual que si hubiera llegado. El aviso queda en la Bandeja.
