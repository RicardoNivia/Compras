// Guía de la aplicación "Panel de Compras" (Sinco), usada como tercera fuente
// de contexto del Agente IA para que pueda explicar cómo funciona la app y
// qué puede hacer el usuario actual según su rol. Mantenla al día si cambian
// las secciones o los permisos (ver lib/roles.js, la fuente real de permisos).

export const APP_GUIDE_TITLE = "Guía de uso del Panel de Compras";

export const APP_GUIDE_TEXT = `El "Panel de Compras" de Sinco tiene 4 secciones posibles en el menú lateral (cada usuario solo ve las que su rol permite):

1. DASHBOARD DE COMPRAS (roles: admin, registro)
   - Tiene dos pestañas: "Mensual" (por defecto, muestra el mes actual) y "Anual" (elige un año, por defecto el año en curso, y muestra el detalle mes a mes de ese año).
   - KPIs: valor del mes/periodo, % de cumplimiento de tiempos (entregas en ≤8 días hábiles), solicitudes en proceso, ticket promedio.
   - Tarjeta de alerta "Solicitudes pendientes": las que llevan más días sin resolverse.
   - Gráficos: valor de compras por mes, valor por área y mes, estado de la compra, tiempos de solicitud a entrega (histograma de días + top de las más demoradas), cumplimiento vs incumplimiento por mes (en %), medio de pago, ahorro (cotizado vs comprado), gauge de cumplimiento de entregas, resumen ejecutivo, compras y ahorro por área, top 5 proveedores, compras por responsable, consumo por categoría y área.
   - Botón "Exportar PDF": genera un PDF con una captura de todo lo que se está viendo en ese momento (respeta la pestaña y el año/mes elegidos).

2. REGISTROS (todos los roles)
   - Tabla con todas las solicitudes de compra: fechas, área, responsable, estado, categoría, descripción, medio de pago, licitación, estado de legalización, proveedor, valores, radicado, observaciones.
   - Filtros: búsqueda de texto, área, estado de compra, medio de pago, licitación, rango de fechas (desde/hasta), y un filtro "Incumplimiento (>8 días)" que muestra solo las solicitudes en proceso o entregadas que llevan más de 8 días hábiles.
   - Columna "Días": indica cuántos días hábiles lleva la solicitud (en proceso) o cuántos tardó en entregarse.
   - Acciones por fila (según el rol, ver más abajo): check de "radicado", editar (abre un modal), eliminar (con confirmación).
   - Botón "+ Agregar registro" (según el rol): abre un modal para crear una nueva solicitud.
   - Botón "Exportar": exporta a Excel (.csv) o PDF los registros que la tabla está mostrando en ese momento (respeta los filtros activos), con la opción adicional de acotar por año/mes.

3. AGENTE IA (solo admin) — esta misma sección donde estás respondiendo
   - Chat que responde preguntas sobre los datos de compras y sobre el procedimiento oficial de compras (ADM-P-01), y ahora también sobre el funcionamiento de la aplicación (esta guía).
   - Puede generar tablas y gráficos (barra, línea, pie) a partir de los datos reales.
   - Tiene un selector de modelo Gemini (indica cuáles son gratuitos y cuáles de pago) y un historial de conversaciones a la izquierda, que se guarda automáticamente.
   - Es de SOLO CONSULTA: no puede crear, editar, eliminar ni aprobar nada — todo eso se hace desde las otras secciones o siguiendo el procedimiento oficial.

4. USUARIOS (solo admin)
   - Administración de cuentas: chips con el conteo de usuarios por rol (clic para filtrar), grid de tarjetas con nombre, correo, rol y estado (activo/inactivo).
   - Permite agregar, editar (incluida la contraseña) y eliminar usuarios, y asignarles uno de los 4 roles.

ROLES Y PERMISOS (definidos en el sistema, no se pueden cambiar desde el chat):
- admin: acceso total a las 4 secciones, incluida la administración de usuarios y el Agente IA.
- registro: ve Dashboard y Registros; en Registros tiene CRUD completo (crear, editar, eliminar y marcar/desmarcar radicado). No ve Usuarios ni Agente IA.
- legalizar (Legalizar factura): solo ve Registros; puede editar solicitudes existentes, pero NO puede crear nuevas, NO puede eliminar y NO puede marcar el check de radicado.
- radicar (Radicar): solo ve Registros; lo único que puede hacer es marcar/desmarcar el check de "radicado" en cada fila — no puede crear, editar ni eliminar solicitudes.

Inicio de sesión: la app pide correo corporativo y contraseña; tras iniciar sesión, redirige automáticamente al Dashboard (si el rol lo permite) o a Registros. El botón "Cerrar sesión" está al final del menú lateral.`;
