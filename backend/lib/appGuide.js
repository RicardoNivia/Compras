// Guía de la aplicación "Panel de Compras" (Sinco), usada como tercera fuente
// de contexto del Agente IA para que pueda explicar cómo funciona la app y
// qué puede hacer el usuario actual según su rol. Mantenla al día si cambian
// las secciones o los permisos (ver lib/roles.js, la fuente real de permisos).

export const APP_GUIDE_TITLE = "Guía de uso del Panel de Compras";

export const APP_GUIDE_TEXT = `El "Panel de Compras" de Sinco tiene hasta 7 secciones en el menú lateral (cada usuario solo ve las que su rol permite):

1. DASHBOARD DE COMPRAS (roles: admin, registro)
   - Tiene dos pestañas: "Mensual" (por defecto, muestra el mes actual) y "Anual" (elige un año, por defecto el año en curso, y muestra el detalle mes a mes de ese año).
   - KPIs: valor del mes/periodo, % de cumplimiento de tiempos (entregas en ≤8 días hábiles), solicitudes en proceso, ticket promedio, y (si hay presupuestos configurados) una tarjeta de "Presupuesto vs. gastado — nivel general" con lo presupuestado, gastado, % consumido y disponible sumando todas las áreas con presupuesto.
   - Tarjeta de alerta "Solicitudes pendientes": las que llevan más días sin resolverse.
   - Gráficos: valor de compras por mes, valor por área y mes, estado de la compra, tiempos de solicitud a entrega (histograma de días + top de las más demoradas), cumplimiento vs incumplimiento por mes (en %), medio de pago, ahorro (cotizado vs comprado), gauge de cumplimiento de entregas, resumen ejecutivo (incluye presupuesto vs. gastado si hay datos), compras y ahorro por área, top 5 proveedores, compras por responsable, y "Consumo por categoría y área" (si el año está en modo "por categoría", también muestra el presupuesto y % consumido de cada categoría dentro del área, resaltado en amarillo/rojo según qué tan cerca o por encima del límite esté).
   - Botón "Exportar PDF": genera un PDF con una captura de todo lo que se está viendo en ese momento (respeta la pestaña y el año/mes elegidos), cuidando no cortar tarjetas ni gráficos entre páginas.

2. REGISTROS (todos los roles)
   - Tabla con todas las solicitudes de compra: fechas, área, responsable, estado, categoría, descripción, medio de pago, licitación, estado de legalización, proveedor, valores, radicado, observaciones.
   - Filtros: búsqueda de texto por cualquier campo, área, estado de compra, estado de legalización (con semáforo de color: Pendiente/Legalizado/Rechazado), medio de pago, licitación, rango de fechas (desde/hasta), y un filtro "Incumplimiento (>8 días)" que muestra solo las solicitudes en proceso o entregadas que llevan más de 8 días hábiles.
   - Columna "Días": indica cuántos días hábiles lleva la solicitud (en proceso) o cuántos tardó en entregarse.
   - Para crear o editar una solicitud, el campo "Categoría" es un autocompletado (se escribe y se filtra entre las opciones del maestro de categorías) — no hay que desplazarse por una lista larga.
   - Si el número de factura (FE) ya existe en otra compra, la app SOLO avisa con un mensaje informativo — no bloquea guardar, porque puede haber facturas legítimamente repetidas.
   - Acciones por fila (según el rol, ver reglas de permisos más abajo): check de "radicado", editar (abre un modal), eliminar (con confirmación, solo admin).
   - Botón "+ Agregar registro" (según el rol): abre un modal para crear una nueva solicitud.
   - Botón "Exportar": exporta a Excel (.csv), PDF o Word los registros que la tabla está mostrando en ese momento (respeta los filtros activos), con la opción adicional de acotar por año/mes.

3. AGENTE IA (todos los roles) — esta misma sección donde estás respondiendo
   - Chat que responde preguntas sobre los datos de compras, sobre el procedimiento oficial de compras (ADM-P-01), sobre el funcionamiento de la aplicación (esta guía) y, solo para admin, sobre el presupuesto configurado.
   - Puede generar tablas y gráficos (barra, línea, pie) a partir de los datos reales.
   - Usa un modelo de Anthropic (Claude), el mismo para todos los roles, sin selector de modelo.
   - Tiene un historial de conversaciones a la izquierda (se guarda automáticamente, se puede abrir una anterior o eliminarla).
   - Es de SOLO CONSULTA: no puede crear, editar, eliminar ni aprobar nada (tampoco presupuestos) — todo eso se hace desde las otras secciones o siguiendo el procedimiento oficial.

4. MAESTROS (solo admin)
   - Administra las listas de opciones que alimentan los campos desplegables/autocompletados del formulario de Registros: Área, Responsable, Estado de compra, Categoría, Medio de pago y Estado legalización — cada una es una pestaña dentro de la sección.
   - Por cada pestaña se pueden agregar, editar, inactivar/reactivar y (si no está en uso en ningún registro) eliminar valores. Un valor ya usado en algún registro no se puede eliminar ni renombrar, para no romper la integridad de los datos existentes — solo se puede inactivar, y así deja de ofrecerse como opción en el formulario sin afectar los registros que ya lo usan.
   - Tiene una barra de búsqueda por nombre dentro de cada pestaña.

5. PRESUPUESTO (solo admin, incluida la lectura — ningún otro rol ve esta información, ni siquiera a través del Agente IA)
   - Selector de año (siempre incluye el año actual y el siguiente, más los años anteriores en los que ya hay compras registradas).
   - Para cada año hay que elegir primero el MODO de presupuesto, una configuración GENERAL que aplica por igual a TODAS las áreas de ese año (no se elige por separado por cada área):
     · "Por área": se asigna un solo valor total de presupuesto anual a cada área.
     · "Por categoría": dentro de cada área se asignan presupuestos individuales a una o varias categorías, y el total del área es automáticamente la suma de esas categorías (útil cuando el gasto de un área se quiere controlar por rubro/categoría en vez de como un solo monto global).
   - Cambiar el modo de un año que ya tiene áreas configuradas en el modo anterior BORRA esos datos — la app pide confirmación explícita y avisa cuántas áreas se verían afectadas antes de hacerlo.
   - Debajo se muestra un resumen general (presupuestado, gastado, % consumido, disponible) y la lista de áreas: se hace clic en un área para desplegar su formulario de edición (el valor único si el modo es "por área", o las filas de categoría con su valor si el modo es "por categoría"), con los montos siempre en pesos colombianos formateados mientras se digitan. Hay una barra de búsqueda para encontrar un área por nombre.
   - Quitar el presupuesto de un área pide confirmación en un modal, indicando que esos datos se perderán.
   - Todo cambio (crear, editar, quitar un presupuesto, o cambiar el modo del año) queda registrado en Auditoría.
   - Lo configurado aquí es lo que alimenta las comparaciones de presupuesto vs. gastado en el Dashboard.

6. USUARIOS (solo admin)
   - Administración de cuentas: chips con el conteo de usuarios por rol (clic para filtrar), grid de tarjetas con nombre, correo, rol y estado (activo/inactivo).
   - Permite agregar, editar (incluida la contraseña) y eliminar usuarios, y asignarles uno de los 4 roles.

7. AUDITORÍA (solo admin)
   - Historial de acciones sensibles: creación/edición/eliminación de registros de compra, cambios de presupuesto (incluidos los cambios de modo), y administración de usuarios. Cada entrada muestra quién hizo el cambio, cuándo, y el detalle de qué campos cambiaron (antes/después).
   - Filtros por rango de fechas, usuario y tipo de entidad afectada.

ROLES Y PERMISOS (definidos en el sistema, no se pueden cambiar desde el chat):
- admin: acceso total a las 7 secciones. Es el ÚNICO rol que puede: eliminar registros de compra, editar/mover la fecha de solicitud de un registro ya creado, ver y configurar Maestros, ver y configurar Presupuesto, ver Auditoría y administrar Usuarios.
- registro: ve Dashboard, Registros y Agente IA. En Registros tiene CRUD completo salvo eliminar y salvo mover la fecha de solicitud una vez creado el registro. No ve Maestros, Presupuesto, Usuarios ni Auditoría.
- legalizar (Legalizar factura): ve Registros y Agente IA. En Registros puede editar solicitudes existentes pero solo estos campos: estado de legalización, número de factura (FE), valor con IVA, valor sin IVA y observaciones — el resto queda intacto. No puede crear, no puede eliminar y no puede tocar el check de radicado.
- radicar (Radicar): ve Registros y Agente IA. Lo único que puede hacer en Registros es MARCAR (nunca desmarcar) el check de "radicado" en cada fila, y solo si esa solicitud ya tiene estado de legalización "Legalizado" — una vez marcado el radicado, no se puede deshacer por nadie. No puede crear, editar (otros campos) ni eliminar solicitudes.

Inicio de sesión: la app pide correo corporativo y contraseña; tras iniciar sesión, redirige automáticamente al Dashboard (si el rol lo permite) o a Registros. El botón "Cerrar sesión" está al final del menú lateral, junto con "Cambiar contraseña".`;
