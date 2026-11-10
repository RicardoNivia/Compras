// Guía de la aplicación "Panel de Compras y Bienestar" (Sinco), usada como tercera fuente
// de contexto del Agente IA para que pueda explicar cómo funciona la app y
// qué puede hacer el usuario actual según su rol. Mantenla al día si cambian
// las secciones o los permisos (ver lib/roles.js, la fuente real de permisos).

import { CRITERIOS_VALORACION } from "@/lib/valoracionIA";

export const APP_GUIDE_TITLE = "Guía de uso del Panel de Compras y Bienestar";

export const APP_GUIDE_TEXT = `El "Panel de Compras y Bienestar" de Sinco tiene dos módulos, Compras y Bienestar, y secciones generales (Alertas, Nova, Usuarios, Auditoría); cada usuario solo ve lo que su rol permite. Si tiene ambos módulos, los cambia con el selector de la barra superior.

MÓDULO BIENESTAR (y Fundación, que va aparte con sus propias páginas y permisos): Resumen (dashboard mensual y anual con el análisis de Nova, que se genera el día 1 de cada mes y se puede pedir con "Resumir de nuevo"), Actividades (tabla; crear o editar abre un formulario por pasos) y Cronograma (vistas Trayectoria, Año y Mes; al hacer clic en una actividad se ve su detalle). Cada actividad tiene ficha con Participantes (importar desde Excel programados, asistentes y calificaciones), Inventario, Fotos, Compras y Formulario público de inscripción. Al cerrarla, la persona la califica de 1 a 5 y Nova genera su análisis con su propio puntaje. Maestros de Bienestar: responsables de actividades, áreas, motivos de inasistencia, unidades y escala de calificación.

MÓDULO COMPRAS, hasta 10 secciones en el menú lateral:

1. DASHBOARD DE COMPRAS (roles: admin, registro)
   - Tiene dos pestañas: "Mensual" (por defecto, muestra el mes actual) y "Anual" (elige un año, por defecto el año en curso, y muestra el detalle mes a mes de ese año).
   - KPIs: valor del mes/periodo, % de cumplimiento de tiempos (entregas en ≤8 días hábiles), solicitudes en proceso, ticket promedio, y (si hay presupuestos configurados) una tarjeta de "Presupuesto vs. gastado — nivel general" con lo presupuestado, gastado, % consumido y disponible sumando todas las áreas con presupuesto.
   - Tarjeta de alerta "Solicitudes pendientes": las que llevan más días sin resolverse.
   - Gráficos: valor de compras por mes, valor por área y mes, estado de la compra, tiempos de solicitud a entrega (histograma de días + top de las más demoradas), cumplimiento vs incumplimiento por mes (en %), medio de pago, ahorro (cotizado vs comprado), gauge de cumplimiento de entregas, resumen ejecutivo (incluye presupuesto vs. gastado si hay datos), compras y ahorro por área, top 5 proveedores, compras por responsable, y "Consumo por categoría y área" (si el año está en modo "por categoría", también muestra el presupuesto y % consumido de cada categoría dentro del área, resaltado en amarillo/rojo según qué tan cerca o por encima del límite esté).
   - Botón "Exportar PDF": genera un PDF con una captura de todo lo que se está viendo en ese momento (respeta la pestaña y el año/mes elegidos), cuidando no cortar tarjetas ni gráficos entre páginas.

2. REGISTROS (admin, registro, legalizar y radicar; el rol Proveedores no lo ve)
   - Tabla con todas las solicitudes de compra: fechas, área, responsable, estado, categoría, descripción, medio de pago, licitación, estado de legalización, proveedor, valores, radicado, observaciones.
   - Filtros: búsqueda de texto por cualquier campo, área, estado de compra, estado de legalización (con semáforo de color: Pendiente/Legalizado/Rechazado), medio de pago, licitación, rango de fechas (desde/hasta), y un filtro "Incumplimiento (>8 días)" que muestra solo las solicitudes en proceso o entregadas que llevan más de 8 días hábiles.
   - Columna "Días": indica cuántos días hábiles lleva la solicitud (en proceso) o cuántos tardó en entregarse.
   - Para crear o editar una solicitud, el campo "Categoría" es un autocompletado (se escribe y se filtra entre las opciones del maestro de categorías) — no hay que desplazarse por una lista larga.
   - Si el número de factura (FE) ya existe en otra compra, la app SOLO avisa con un mensaje informativo — no bloquea guardar, porque puede haber facturas legítimamente repetidas.
   - Acciones por fila (según el rol, ver reglas de permisos más abajo): check de "radicado", editar (abre un modal), eliminar (con confirmación, solo admin).
   - Columna "Valoración Nova": en las compras radicadas muestra el puntaje (1 a 5) que Nova dio a la compra y al proveedor; al hacer clic se ve por qué Nova calificó así. Al marcar una compra como radicada se abre solo el modal que la valora y guarda la valoración (ver sección 9).
   - Botón "+ Agregar registro" (según el rol): abre un modal para crear una nueva solicitud.
   - Botón "Exportar": exporta a Excel (.csv), PDF o Word los registros que la tabla está mostrando en ese momento (respeta los filtros activos), con la opción adicional de acotar por año/mes.

3. NOVA (admin, registro, legalizar, radicar y proveedores) — esta misma sección donde estás respondiendo (tu nombre es Nova)
   - Chat que responde preguntas sobre los datos de compras, sobre el procedimiento oficial de compras (ADM-P-01), sobre el funcionamiento de la aplicación (esta guía) y, solo para admin, sobre el presupuesto configurado.
   - Puede generar tablas y gráficos (barra, línea, pie) a partir de los datos reales.
   - Usa un modelo de Anthropic (Claude), el mismo para todos los roles, sin selector de modelo.
   - Tiene un historial de conversaciones a la izquierda (se guarda automáticamente, se puede abrir una anterior o eliminarla).
   - Es de SOLO CONSULTA: no puede crear, editar, eliminar ni aprobar nada (tampoco presupuestos) — todo eso se hace desde las otras secciones o siguiendo el procedimiento oficial.

4. MAESTROS (admin; el rol Proveedores ve y administra solo los maestros de Proveedores)
   - Administra las listas de opciones que alimentan los campos desplegables/autocompletados del formulario de Registros: Área, Responsable, Estado de compra, Categoría, Medio de pago y Estado legalización — cada una es una pestaña dentro de la sección.
   - Por cada pestaña se pueden agregar, editar, inactivar/reactivar y (si no está en uso en ningún registro) eliminar valores. Un valor ya usado en algún registro no se puede eliminar ni renombrar, para no romper la integridad de los datos existentes — solo se puede inactivar, y así deja de ofrecerse como opción en el formulario sin afectar los registros que ya lo usan.
   - Tiene una barra de búsqueda por nombre dentro de cada pestaña.

5. PRESUPUESTO (solo admin, incluida la lectura — ningún otro rol ve esta información, ni siquiera a través de Nova)
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
   - Permite agregar, editar (incluida la contraseña) y eliminar usuarios, y asignarles uno de los 5 roles.

7. AUDITORÍA (solo admin)
   - Historial de acciones sensibles: creación/edición/eliminación de registros de compra, cambios de presupuesto (incluidos los cambios de modo), y administración de usuarios. Cada entrada muestra quién hizo el cambio, cuándo, y el detalle de qué campos cambiaron (antes/después).
   - Filtros por rango de fechas, usuario y tipo de entidad afectada.

8. PROVEEDORES (roles: admin y proveedores pueden gestionar; el rol registro solo puede consultar)
   - Qué es: el maestro general de proveedores y el control de su actualización anual. Cada proveedor del catálogo (el mismo que se elige al registrar una compra) vive aquí, con su NIT, nombre, área, tipo de servicio, criticidad (Crítico / No crítico) y contacto.
   - CICLO ANUAL: los proveedores se actualizan una vez al año. La fecha de corte por defecto es el 31 de marzo (la configura el admin en Maestros, sección "Ciclo de actualización de proveedores": día, mes y días de aviso). El ciclo de un año va del 1 de abril al 31 de marzo del año siguiente (el "ciclo 2026" va del 1 abr 2026 al 31 mar 2027). Al día siguiente del corte, el 1 de abril, todos los proveedores que se actualizan quedan automáticamente como "Desactualizados" y la persona que gestiona proveedores va marcando cuáles se están actualizando. Cambiar la fecha de corte aplica desde el próximo ciclo; el ciclo vigente conserva sus fechas.
   - CLASIFICACIÓN (cada proveedor está en una sola):
     · Nuevos: proveedores creados en el año del ciclo. Entran ya actualizados, así que NO se les pide actualización ese año (sí deben completar el checklist). El 1 de abril siguiente pasan a "Actualización".
     · Actualización: los que deben actualizarse cada año. Empiezan el ciclo como Desactualizados.
     · Excepciones: proveedores que no requieren actualización anual ni checklist, por su actividad económica o por otra razón. Tienen un motivo obligatorio (por ejemplo gran contribuyente, proveedor internacional, compra ocasional o actividad económica; la lista de motivos se administra en Maestros) y una justificación opcional. No generan alerta en Compras.
     · Inactivos: desvinculados, no aptos o anulados. No aparecen al registrar compras, conservan su histórico y se pueden reactivar.
   - ESTADO EN EL CICLO (solo Nuevos y Actualización): Desactualizado → En proceso (se pidieron los documentos) → En aprobación → Actualizado. Se puede devolver a Desactualizado. Para marcar "Actualizado" el checklist debe estar completo (6/6). Cada cambio queda en Auditoría.
   - CHECKLIST DE COMPRAS (6 requisitos): 3 automáticos que se cumplen solos cuando el dato existe — criticidad definida, área y tipo de servicio, contacto registrado — y 3 manuales que se verifican y se renuevan en cada ciclo — RUT vigente, certificación bancaria y consulta en listas restrictivas. Cada verificación guarda quién la hizo y cuándo. Un proveedor sin checklist completo genera la alerta que ve Compras.
   - HISTÓRICO: cada ciclo guarda el estado final y el checklist de cada proveedor, así que siempre se puede ver cómo estuvo en años anteriores (en la ficha, pestaña "Histórico por año").
   - ALERTA EN REGISTROS: al elegir un proveedor en el formulario de una compra aparece un aviso según su situación — "Información actualizada" (al día), "Proveedor desactualizado", "Checklist incompleto" (con los documentos que faltan), "En trámite" (En proceso o En aprobación), "Excepción" o "Proveedor inactivo". En la tabla de Registros aparece además un ícono de advertencia junto al proveedor. La alerta es SOLO informativa: nunca impide registrar la compra.
   - PANTALLAS: el maestro tiene pestañas con la misma nomenclatura de siempre — Nuevos, Actualización, Excepciones, Checklist e Inactivos (más "Todos") — con filtros por búsqueda, área, criticidad, estado del ciclo y checklist, una búsqueda con Nova en lenguaje natural y paginación. El botón "Ver detalle" de cada fila abre una ventana con el checklist, el histórico por año, los datos y las acciones (cambiar de estado, marcar excepción, inactivar o reactivar, editar). "Nuevo proveedor" permite pegar el correo de solicitud para que Nova complete los campos del formulario (la persona siempre revisa y confirma antes de guardar). La pestaña "Indicadores" muestra el avance del ciclo, las actualizaciones por mes, el estado por área, los proveedores críticos pendientes, los días para el corte y las compras hechas con proveedores en alerta.
   - NIT: es la llave primaria del proveedor (no puede haber dos con el mismo NIT; el formulario avisa al instante si ya existe). Tipo (criticidad), clasificación por monto, tipo de servicio, área de proveedor y motivo de excepción son maestros. El ciclo se calcula con la fecha de ÚLTIMA ACTUALIZACIÓN del proveedor (no la de registro) y las excepciones no participan del ciclo. Un proveedor solo se puede eliminar si ninguna compra ni calificación lo usa; si no, se marca como inactivo.
   - CALIFICACIÓN DE NOVA: el detalle del proveedor tiene la pestaña "Compras y calificaciones" con su calificación general (promedio del puntaje que Nova le dio en sus compras valoradas), la distribución de puntajes y el historial de compras con la valoración de cada una; la tabla del maestro muestra la columna "Calificación Nova". Ver sección 9.
   - Tú (Nova) solo consultas: puedes explicar estas reglas y consultar el estado de un proveedor, listas o sus valoraciones con tus herramientas, pero no puedes cambiar estados, documentos, excepciones ni crear proveedores.

9. VALORACIÓN DE NOVA A LAS COMPRAS Y DE LOS PROVEEDORES (se genera al radicar una compra)
   - Qué es: cuando una compra se marca como radicada, Nova la analiza y guarda dos puntajes de 1 a 5 (5 excelente, 1 muy deficiente): uno para la COMPRA y otro para el PROVEEDOR, cada uno con una observación que explica por qué se calificó así y una lista de factores (a favor, neutros o en contra). Las compras radicadas que ya existían se valoran solas en segundo plano. Quien tiene permiso de radicar o editar puede volver a valorar una compra desde la columna "Valoración Nova".
   - Con qué datos: todo el registro (fechas de solicitud y entrega, días hábiles hasta la entrega frente al plazo de 8 días hábiles, estado, legalización, categoría, área, medio de pago, factura, valores y moneda, observaciones), la ficha del proveedor en el módulo de Proveedores y TODAS las compras anteriores con ese mismo proveedor (cumplimiento de plazos, valores frente a las compras previas y a las de la misma categoría, anulaciones, calificaciones humanas).
   - La CALIFICACIÓN GENERAL del proveedor es el promedio del puntaje de proveedor de todas sus compras valoradas.
   - Criterios con los que califica Nova (son exactamente estas instrucciones):
${CRITERIOS_VALORACION}
   - Cuando te pregunten en qué parámetros se califican las compras o los proveedores, explícalo con estos criterios, en lenguaje claro. Cuando pregunten por qué una compra o un proveedor tiene cierto puntaje, consulta la valoración guardada con tu herramienta "consultar_valoraciones" y cita la observación y los factores reales; nunca inventes un puntaje ni una explicación.

10. MI DÍA Y ALERTAS (todos los roles; antes "Alertas y notificaciones")
   - Qué es: la primera pantalla para saber qué hacer hoy. Muestra SOLO lo que le toca a cada rol, en secciones ordenadas por urgencia (rojo = urgente, naranja = conviene moverlo pronto, azul = seguimiento). Cada fila lleva un botón "Ir" que abre directamente el registro o el proveedor.
   - Qué ve cada rol: Radicar — compras legalizadas por radicar y radicadas sin valoración de Nova. Legalizar — compras ejecutadas por legalizar y legalizaciones rechazadas. Registro — solicitudes atrasadas y legalizaciones rechazadas. Proveedores — proveedores desactualizados, actualizaciones estancadas (más de 15 días sin cambios), checklist incompleto, NIT provisional y los días que faltan para el corte del ciclo. Admin — todo lo anterior más áreas con 80% o más del presupuesto, compras mal valoradas por Nova y entregas fuera de plazo.
   - Reglas de urgencia: una solicitud sin entregar pasa a urgente al superar 8 días hábiles (alerta temprana desde 5); una compra por legalizar, por radicar o un proveedor suben de nivel según los días que llevan esperando; si el corte del ciclo de proveedores está cerca, todos los desactualizados son urgentes.
   - Siempre actual: los pendientes se recalculan cada vez que se entra a la pantalla (no hay botón de actualizar).
   - "Solo lo mío" filtra los registros donde la persona es la responsable. "Resumir mi día con Nova" propone por dónde empezar.
   - Tú (Nova) puedes decir qué le toca hoy a quien te escribe con tu herramienta "mis_pendientes"; explícalo con prioridades claras y referencias reales, primero lo urgente.
   - Informes listos para enviar: si la persona es responsable de un informe programado del Estudio de informes, cuando se genera le aparece aquí con el botón "Enviar" (ver sección 11).

11. ESTUDIO DE INFORMES (menú "Informes"; por defecto solo admin, se habilita por rol en la Matriz de permisos)
   - Crear: se escribe con palabras lo que se necesita ("Quiero un informe mensual para gerencia con…") y Nova lo arma; o se elige una plantilla (Cierre mensual de compras, Presupuesto por área, Desempeño de proveedores, Cumplimiento de tiempos, Ciclo de proveedores) o un informe en blanco.
   - Editar: a la izquierda el chat con Nova (se selecciona una sección del documento y se le pide el cambio: "más corto", "cámbiala a dona", "agrega el top 5 de proveedores"; cada cambio se puede deshacer); en el centro el informe como una página A4; a la derecha las secciones (arrastrar para ordenar), agregar secciones a mano y el período del informe. Las cifras las calcula el sistema con los datos reales; Nova solo decide la estructura y redacta los textos.
   - Cifras verificables: al hacer clic en una cifra clave o en una barra/porción de una gráfica se ve de dónde sale: fórmula, filtro, cuántos registros la forman, el detalle por área, los registros principales y el valor del período anterior.
   - Vista previa: es exactamente el PDF que se descarga y se envía.
   - Programar (3 pasos): 1) cuándo, escrito con palabras ("el primer lunes hábil de cada mes a las 8") con las próximas fechas en un calendario que salta festivos colombianos, qué período cubre cada envío (mes anterior, semana anterior, año a la fecha…) y si se envía siempre o solo con una condición (un área sobre el 80% del presupuesto, o compras fuera de plazo); 2) destinatarios, asunto y mensaje (con variables como {periodo} y {resumen_nova}, que Nova escribe con las cifras de cada envío) y la forma de entrega; 3) revisar, probar con uno mismo y activar.
   - Entrega: hoy solo "Lo envío yo" — a la hora programada se genera el PDF y le llega al responsable en Mi día; con "Enviar" descarga el PDF, abre Outlook con el correo ya escrito, adjunta el PDF y marca "Ya lo envié". El correo automático está en espera de que IT habilite el envío de correo y Microsoft Teams llegará próximamente.
   - Historial de envíos (pestaña del informe): cada vez que el informe se genera queda guardado su PDF tal como salió ese día y quién lo envió; se pueden comparar dos envíos (por ejemplo septiembre frente a octubre), descargar PDFs de meses pasados, generar uno al momento y ver toda la actividad del informe (también queda en Auditoría).

ROLES Y PERMISOS (definidos en el sistema, no se pueden cambiar desde el chat):
- admin: acceso total a las 8 secciones. Es el ÚNICO rol que puede: eliminar registros de compra, editar/mover la fecha de solicitud de un registro ya creado, ver y configurar Maestros, ver y configurar Presupuesto, ver Auditoría y administrar Usuarios.
- registro: ve Dashboard, Registros y Nova. En Registros tiene CRUD completo salvo eliminar y salvo mover la fecha de solicitud una vez creado el registro. No ve Maestros, Presupuesto, Usuarios ni Auditoría.
- legalizar (Legalizar factura): ve Registros y Nova. En Registros puede editar solicitudes existentes pero solo estos campos: estado de legalización, número de factura (FE), valor con IVA, valor sin IVA y observaciones — el resto queda intacto. No puede crear, no puede eliminar y no puede tocar el check de radicado.
- radicar (Radicar): ve Registros y Nova. Lo único que puede hacer en Registros es MARCAR (nunca desmarcar) el check de "radicado" en cada fila, y solo si esa solicitud ya tiene estado de legalización "Legalizado" — una vez marcado el radicado, no se puede deshacer por nadie. No puede crear, editar (otros campos) ni eliminar solicitudes.
- proveedores (Proveedores): es el rol de quien gestiona a los proveedores. Ve la sección Proveedores (maestro e indicadores), Maestros (solo los de Proveedores, incluido el ciclo de actualización) y Nova: puede cambiar el estado del ciclo, verificar los documentos del checklist, marcar excepciones, inactivar, reactivar, crear, editar y eliminar proveedores (si ninguna compra los usa). También ve Mi día y alertas (sus pendientes de proveedores). No ve Dashboard de compras, Registros ni el resto de secciones.
- registro también puede CONSULTAR la sección Proveedores (maestro e indicadores), pero no puede modificar nada allí.

Inicio de sesión: la app pide correo corporativo y contraseña; tras iniciar sesión, redirige automáticamente al Dashboard (si el rol lo tiene habilitado) o, si no, a Mi día y alertas, que está disponible para todos los roles. El botón "Cerrar sesión" está al final del menú lateral, junto con "Cambiar contraseña".`;
