# Notificaciones configurables por prompt: diseño detallado

Estado: **aprobado** (2026-10-17). Fase 1 y fase 2 (eventos) construidas y probadas en local; pendiente el flujo real de Teams.

Cambios posteriores al diseño original:
- Interfaz rediseñada: Mis notificaciones en tarjetas con encabezado de indicadores (activas X/10, enviadas hoy, pausadas, te llegan de otros) y pedido rápido a Nova; Bandeja como feed agrupado por día.
- Cada notificación recibida dice **de qué configuración viene** (nombre de la notificación y quién la configuró), en la app y en la tarjeta de Teams.
- **Avisos en vivo**: cuando se cumple una notificación, cada destinatario ve un aviso flotante en la pantalla en la que esté (revisión cada 20 s y al volver a la pestaña).
- Confirmaciones con modal de la app (no `window.confirm`).
- Por evento: el catálogo final está en `EVENTOS` (incluye `compra.calificada`); no se pregunta hora ni festivo salvo en el resumen diario.
Fecha: 2026-10-17.

## 1. Objetivo

Cada persona configura sus propias notificaciones escribiendo lo que quiere en lenguaje natural. Nova interpreta el pedido, pregunta lo que no está claro y lo convierte en una **regla** que la persona ve, ajusta y activa. Desde ese momento la regla se ejecuta sola, sin IA, y entrega el aviso **dentro de la app** y por **Teams**. El correo aparece en pantalla, pero deshabilitado.

Ejemplos que debe resolver:

| Pedido | Tipo | Lo que Nova debe preguntar |
|---|---|---|
| "Cuando una compra se legalice, envíame qué valoración sacó" | Por evento (fase 2) | La valoración se genera al **radicar**, no al legalizar. ¿Te aviso al radicar, que es cuando ya existe? |
| "Cada lunes, cuántas compras se registraron la semana anterior" | Programada | ¿Si el lunes es festivo lo corro al martes, lo envío igual o lo salto? ¿A qué hora? ¿"Registrada" es por fecha de solicitud o por el día en que se creó en el sistema? |
| "Las compras que se vencen ese día, todos los días" | Programada | ¿A qué hora? Aclarar qué es "vencer" (ver §6.3). Confirmar que **si no hay ninguna, no se envía**. |
| "Notifícame con gráficas y todo el dashboard del mes" | No es una notificación | Se redirige a **Estudio de informes** (§5.4). |
| "Avísame cuando el presupuesto de Mercadeo pase el 80 %", pedido por alguien del rol Registro | Rechazada | Por seguridad no se puede crear: su rol no ve Presupuesto (§7). |

## 2. Decisiones ya tomadas

| Tema | Decisión |
|---|---|
| Canales | **En la app** (siempre) y **Teams**, desde la fase 1. Correo visible pero deshabilitado mientras SMTP siga bloqueado (`MAIL_MAINTENANCE`). |
| Destinatarios | Solo usuarios activos que **ya tengan acceso** a los datos de la notificación. |
| Datos que el creador no puede ver | Nova responde que **por seguridad no se puede crear**. El servidor lo valida aunque Nova se equivoque. |
| Administradores | Ven todas las notificaciones de todos. Pueden editar, pausar, reanudar y eliminar cualquiera. |
| Alcance | Una notificación = **una fuente de datos y un resultado simple**. Lo que necesite varias fuentes o gráficas va a Informes. |
| Primera entrega | Fase 1: notificaciones **programadas**, en la app y por Teams. |
| Menú | Se renombra a **"Alertas y notificaciones"**. |
| Contador rojo | La campana cuenta **solo las notificaciones no leídas que vienen de este módulo** (las que alguien programó y configuró aquí). Los pendientes de Mi día nunca suman al contador. |
| Límites | **10** notificaciones **creadas** por persona, en cualquier estado (incluidos los admins), y **6** destinatarios por notificación. |
| Teams | **Un solo flujo** que escribe por chat a cada persona. |
| Enviar ahora | Botón **"Enviar ahora"** (propietario o admin): ejecuta la notificación en ese momento para **todos** sus destinatarios, con datos reales. Queda en el historial con origen **manual** y quién la corrió, se audita (acción `enviar`) y el mensaje lo indica: "Enviada manualmente por {nombre}". No reemplaza el envío programado del día. **No aplica a las notificaciones por evento** (salen solas cuando ocurre el hecho): tampoco tienen "Probar" ni "Guardar y probar"; el servidor rechaza ambos. Respeta la condición: si no hay resultados y la regla dice "solo si hay resultados", se informa y no se envía. |
| Darse de baja | Cualquier destinatario puede dejar de recibir una notificación creada por otra persona. **Queda en auditoría**, igual que volver a suscribirse o que el creador lo agregue de nuevo. |

## 3. Principio de diseño

```
Pedido libre ──► Nova interpreta (1 a 3 llamadas) ──► Preguntas ──► Regla JSON ──► Persona confirma
                                                                                   │
                         ┌─────────────────────────────────────────────────────────┘
                         ▼
   Programador (cada minuto) ──► Consulta determinista ──► Condición ──► Mensaje ──► Entregas (app, Teams)
```

- **La IA solo interviene al crear o editar.** La ejecución no la usa: si la API de Anthropic falla, las notificaciones siguen saliendo, y no cuestan tokens.
- **Las cifras salen de consultas reales**, igual que en Informes. Nova nunca escribe un número.
- **La regla siempre es visible y editable a mano.** No hay interpretaciones escondidas.
- **El servidor no confía en lo que devuelve Nova**: valida cada campo contra el catálogo y los permisos antes de guardar.

## 4. Anatomía de una regla

| Parte | Campo | Valores |
|---|---|---|
| Disparador | `disparador` | `programado` (fase 1) o `evento` (fase 2) |
| Programación | `frecuencia`, `diaSemana`, `diaMes`, `ordinal`, `fechaUnica`, `hora`, `siFestivo` | Las mismas frecuencias de Informes (`lib/reportSchedule.js`): diaria, semanal, mensual, mensual_semana, ultimo_habil, unica |
| Evento | `evento` | Catálogo de §6.2 (fase 2) |
| Datos | `consulta` y `parametros` | Una consulta del catálogo de §6.1 con sus filtros |
| Alcance | `alcance` | `general` (todos reciben lo mismo) o `personal` (cada destinatario recibe lo suyo, p. ej. "mis pendientes") |
| Condición | `condicion` | `siempre`, `si_hay_resultados` o `umbral` (p. ej. "más de 5") |
| Mensaje | `titulo`, `plantilla` | Texto con variables (§8) |
| Canales | `canales` | `app` (obligatorio) y `teams` (opcional) |
| Destinatarios | relación | Yo y otros usuarios elegibles |

### 4.1 Festivos: `siFestivo`

Pregunta obligatoria cuando la programación cae en un día concreto (semanal, mensual o única):

| Opción | Comportamiento | Implementación |
|---|---|---|
| `correr` (por defecto) | Se envía el siguiente día hábil | `saltarFestivos: true` (ya existe) |
| `enviar` | Se envía igual, aunque sea festivo | `saltarFestivos: false` (ya existe) |
| `omitir` | Ese período no se envía | Nuevo: `esFechaDeEnvio` devuelve falso si la fecha natural no es hábil |

La frecuencia `diaria` significa "cada día hábil". Si alguien pide "todos los días, incluso fines de semana", se activan `sabadoHabil` y `domingoHabil`, que ya existen en `reportSchedule.js`.

## 5. Interpretación con Nova

### 5.1 Contrato de la respuesta

`POST /api/notificaciones/nova/interpretar` recibe `{ pedido, respuestas, reglaParcial }` y devuelve:

```json
{
  "estado": "preguntas",
  "resumen": "Cada lunes te digo cuántas compras se registraron la semana anterior.",
  "regla": { "disparador": "programado", "frecuencia": "semanal", "diaSemana": 1, "consulta": "conteo_compras", "parametros": { "periodo": "semana_anterior" } },
  "preguntas": [
    {
      "id": "hora",
      "texto": "¿A qué hora te lo envío?",
      "opciones": [{ "valor": "07:00", "etiqueta": "7:00 a. m." }, { "valor": "08:00", "etiqueta": "8:00 a. m." }],
      "permiteTexto": true
    },
    {
      "id": "siFestivo",
      "texto": "Si el lunes es festivo, ¿qué hago?",
      "opciones": [
        { "valor": "correr", "etiqueta": "Enviarlo el martes" },
        { "valor": "enviar", "etiqueta": "Enviarlo igual el lunes" },
        { "valor": "omitir", "etiqueta": "No enviarlo esa semana" }
      ]
    },
    {
      "id": "campoFecha",
      "texto": "¿\"Registradas\" por fecha de solicitud o por el día en que se crearon en el sistema?",
      "opciones": [
        { "valor": "fechaSolicitud", "etiqueta": "Fecha de solicitud" },
        { "valor": "createdAt", "etiqueta": "Fecha en que se crearon" }
      ]
    }
  ]
}
```

| `estado` | Qué significa | Qué muestra la pantalla |
|---|---|---|
| `preguntas` | Falta información | Las preguntas, cada una con opciones tocables y texto libre si aplica |
| `lista` | La regla está completa | La tarjeta de resumen para confirmar (§9.3) |
| `no_permitido` | Usa datos que el rol del creador no ve | "Por seguridad no puedes crear esta notificación: usa datos de *Presupuesto*, que tu rol no tiene habilitados." Sin regla ni botón para continuar. |
| `es_informe` | Pide gráficas, el dashboard o varias fuentes | Explicación y botón "Crearlo en Estudio de informes", si la persona tiene `viewReportes`. Si no lo tiene: "Los informes los configura un administrador." |
| `no_soportado` | No hay una consulta o evento que lo cubra | Lo que sí se puede hacer, con 2 o 3 sugerencias |

### 5.2 Preguntas obligatorias del servidor

Nova puede olvidar una pregunta. Por eso, después de cada respuesta de Nova, el servidor revisa la regla parcial con `preguntasFaltantes(regla)`, una función pura y determinista, y **añade** las preguntas que falten:

| Si la regla… | El servidor exige |
|---|---|
| Es programada y no tiene `hora` | Pregunta de hora |
| Es semanal, mensual o única y no tiene `siFestivo` | Pregunta de festivo |
| Su consulta devuelve una lista y no tiene `condicion` | "Si no hay resultados, ¿la envío igual o no?" (por defecto: no) |
| Su consulta filtra por fecha y es ambigua (`campoFecha`) | "¿Por fecha de solicitud o de creación?" |
| Tiene `alcance` sin definir y la consulta admite ambos | "¿Lo de todos o solo lo tuyo?" |

Mientras falte algo, la regla no se puede guardar como activa (sí como borrador).

Las notificaciones **por evento** (fase 2, p. ej. "avísame cuando se genere una calificación de proveedor o una valoración de compra") salen en el momento en que ocurre el evento: **no se pregunta hora ni festivo**. Solo se pregunta la hora si la persona elige agruparlas en un `resumen_diario`.

### 5.3 Instrucción del sistema (resumen)

- Se le da a Nova **solo el catálogo de consultas y eventos que el rol del creador puede usar**, igual que `buildToolDefs` en `lib/agentTools.js`. Además se le da la lista de fuentes no permitidas, solo con sus nombres, para que pueda contestar `no_permitido` en lugar de `no_soportado`.
- Reglas: una sola fuente; nunca inventar campos; preguntar en lugar de suponer; máximo 3 preguntas por turno; español de Colombia; hoy es {fecha} y la zona horaria es America/Bogota.
- Salida con `generateStructuredJson` (`lib/aiStructured.js`) y un esquema JSON estricto.
- Límite de 4 turnos de aclaración. Si en el cuarto aún falta algo, se abre el formulario manual con lo que se haya entendido.

### 5.4 Cuándo es un informe y no una notificación

Nova contesta `es_informe` si el pedido incluye cualquiera de estas cosas:

- Gráficas, el "dashboard" o un PDF.
- Más de una fuente de datos, como compras y presupuesto al mismo tiempo.
- Análisis o redacción larga, como "explícame por qué bajaron las compras".

El botón abre `/informes` con el pedido precargado. Ese flujo ya existe con `armarDesdePedido`.

## 6. Catálogos

### 6.1 Consultas (fase 1)

Cada consulta es una función determinista en `backend/lib/notificacionesConsultas.js`. Reutiliza `lib/alerts.js`, `lib/pendientes.js`, el ejecutor de `lib/agentTools.js` y `lib/proveedoresCiclo.js`. Ninguna acepta SQL ni texto libre como filtro de base de datos: solo parámetros validados.

| Clave | Qué devuelve | Parámetros | Fuente (permiso) |
|---|---|---|---|
| `conteo_compras` | Número de compras y valor total con IVA, más los 5 más altos | `periodo`, `campoFecha`, `area`, `categoria`, `estado`, `proveedorNit` | Compras |
| `lista_compras` | Lista de compras (máx. 25 en el mensaje y enlace al resto) | Los mismos filtros y un `preset`: `vencen_hoy`, `vencen_en_dias`, `atrasadas`, `por_legalizar`, `por_radicar`, `rechazadas`, `sin_valoracion` | Compras |
| `valoraciones_compras` | Compras valoradas en el período, con puntajes; opcionalmente solo las de puntaje ≤ N | `periodo`, `puntajeMax`, `proveedorNit` | Compras |
| `mis_pendientes` | Resumen de "Mi día" del destinatario: totales, urgentes y los 5 primeros | `secciones` (opcional) | Mi día (solo `alcance: personal`) |
| `proveedores_ciclo` | Proveedores desactualizados, estancados, con checklist incompleto o NIT provisional | `preset`, `criticidad`, `area` | Proveedores |
| `presupuesto_ejecucion` | Ejecución por área del año, solo las que superan el umbral | `anio`, `umbral` (80 por defecto), `area` | Presupuesto |

Períodos admitidos: `hoy`, `ayer`, `semana_actual`, `semana_anterior` (lunes a domingo), `mes_actual`, `mes_anterior`, `ultimos_n_dias`.

### 6.2 Eventos (fase 2)

Se publican desde `lib/records.js`, `lib/valoraciones.js` y `lib/proveedoresCiclo.js`, comparando el antes y el después **después** de guardar.

| Evento | Cuándo | Datos para el mensaje |
|---|---|---|
| `compra.creada` | `createRecord` | #, descripción, área, valor, responsable |
| `compra.legalizada` | `estadoLegalizacion` pasa a "Legalizado" | #, proveedor, valor |
| `compra.rechazada` | `estadoLegalizacion` pasa a "Rechazado" | #, observaciones |
| `compra.radicada` | `radicado` pasa de falso a verdadero | #, proveedor, valor |
| `compra.valorada` | Se crea o se regenera su `ValoracionCompra` | #, puntaje de la compra y del proveedor, resumen |
| `compra.entregada` | Se llena `fechaEntrega` | #, días hábiles que tomó, si fue fuera de plazo |
| `compra.anulada` | `estado` pasa a "Anulado" | #, quién la anuló |
| `compra.actualizada` | Cualquier campo cambia (`updateRecord`/`patchRecord`) | Lista de cambios campo: antes → después (etiquetas de la auditoría; los de catálogo solo si cambió el valor elegido), quién |
| `proveedor.actualizado` | Cualquier dato del proveedor cambia (formulario o clasificación) | Lista de cambios campo: antes → después, quién |
| `proveedor.eliminado` | `deleteProveedor` | NIT, nombre, área, criticidad, quién lo eliminó (sin enlace) |
| `presupuesto.actualizado` | Se crea, modifica o elimina un presupuesto, o cambia el modo del año | Área, año, cambios (total y categorías: antes → después), quién |
| `compra.eliminada` | `deleteRecord` (solo admin) | Datos de la compra tal como estaban, quién la eliminó (sin enlace: el registro ya no existe) |
| `proveedor.creado` | Alta en el catálogo | NIT, nombre, criticidad |
| `proveedor.ciclo_cambio` | Cambia el estado del ciclo | NIT, de → a |
| `presupuesto.umbral` | Un área cruza el 80 % o el 100 % | Área, ejecutado, presupuesto, % |

Los eventos admiten filtros (p. ej. `compra.valorada` con `puntajeMax: 2`, o solo de cierta área) y se pueden **agrupar**: `inmediato`, `cada_15_min` o `resumen_diario` a una hora. Así, 20 legalizaciones juntas llegan como un solo mensaje.

El ejemplo "cuando una compra se legalice, envíame qué valoración sacó" se resuelve con `compra.valorada`: la valoración solo existe después de radicar, y Nova debe explicarlo.

### 6.3 Qué significa "se vence"

Las compras **no tienen fecha de vencimiento**. Lo más cercano es el plazo de **8 días hábiles** desde la fecha de solicitud mientras no haya fecha de entrega (`SLA_DIAS_HABILES` en `lib/alerts.js`). El preset `vencen_hoy` es: sin `fechaEntrega`, no anulada y hoy es su **8.º día hábil**.

Nova debe preguntar: "¿Te refieres a las que cumplen hoy el plazo de 8 días hábiles? ¿Incluyo también las que ya están vencidas?". Si la respuesta es sí, se usa `atrasadas` en lugar de `vencen_hoy`.

## 7. Seguridad y permisos

### 7.1 Fuentes y permisos

`lib/notificacionesPermisos.js#puedeVerFuente(user, fuente)` es el único punto de decisión:

| Fuente | Regla |
|---|---|
| Compras | `canViewRegistros(role)` (admin, registro, legalizar, radicar) |
| Mi día | `isRoleAllowed(role, "viewAlertas")` |
| Proveedores | `isRoleAllowed(role, "viewProveedores")` |
| Presupuesto | `isRoleAllowed(role, "viewPresupuesto")` |
| Auditoría | Fuera del alcance de las notificaciones (no se ofrece) |

Además, para usar el módulo se necesita la feature nueva `viewNotificaciones` en `FEATURES` (`lib/permissions.js`), con todos los roles por defecto.

### 7.2 Dónde se valida

| Momento | Validación | Si falla |
|---|---|---|
| Nova interpreta | Solo recibe el catálogo permitido | `no_permitido` con mensaje de seguridad |
| Guardar (crear o editar) | `puedeVerFuente(creador)` y `puedeVerFuente(cada destinatario)`; todos activos | 403 con el motivo; nunca se guarda a medias |
| Elegir destinatarios | `GET /destinatarios-elegibles?fuente=…` lista solo a quienes pueden; los demás no aparecen | — |
| Cada ejecución | Se revalida al creador y a cada destinatario | Creador sin permiso: la regla pasa a `pausada_por_permisos` y queda auditado. Destinatario sin permiso o inactivo: se omite esa entrega, con motivo |
| Admin edita la de otro | El admin puede todo, pero la regla sigue sujeta a los permisos de su **propietario** y destinatarios | No puede, por ejemplo, poner presupuesto en una regla de alguien de Registro |

### 7.3 Otros controles

- **Inyección de instrucciones:** el pedido solo produce una regla que el servidor valida contra catálogos cerrados. Los textos del registro (descripción, observaciones) se insertan en el mensaje escapados y recortados; nunca vuelven a la IA.
- **Límites:** 10 notificaciones **creadas** por persona, en cualquier estado (también para los admins; se valida al crear; por eso "Mías" no se pagina), 6 destinatarios por notificación, la frecuencia mínima es diaria (en fase 1 no hay "cada hora") y 25 ítems por mensaje.
- **Teams:** la URL del webhook es un secreto. Va en `backend/.env`, nunca en la base de datos, el repositorio, los logs ni la auditoría (§10.4).
- **Dejar de recibir:** cualquier destinatario puede darse de baja de una notificación que creó otro. Queda auditado y el creador lo ve.

## 8. Mensaje

### 8.1 Plantilla

La regla guarda `titulo` y `plantilla`. Nova propone un texto al crear la regla y la persona lo puede editar.

Variables disponibles según la consulta:

- `{total}`, `{valor_total}` (es-CO), `{periodo}`, `{fecha}`, `{lista}`.
- Por evento: `{numero}`, `{descripcion}`, `{proveedor}`, `{puntaje_compra}`, `{puntaje_proveedor}`, `{resumen_valoracion}`.

`{lista}` se convierte en filas en la app y en un `FactSet` o `ColumnSet` en Teams. Si hay más de 25 ítems: "y 12 más · Ver todas".

### 8.2 Tarjeta de Teams (Adaptive Card 1.4)

```
┌──────────────────────────────────────────────┐
│ 🔔 Compras que vencen hoy                     │
│ Viernes 17 de octubre · 3 compras             │
├──────────────────────────────────────────────┤
│ #412  Licencias Adobe        $4.200.000       │
│ #415  Refrigerios comité     $  380.000       │
│ #418  Tiquetes Bogotá-Cali   $1.150.000       │
├──────────────────────────────────────────────┤
│ [ Ver en el panel ]                           │
│ Configurada por Usuario Demo · Gestionar     │
└──────────────────────────────────────────────┘
```

- "Ver en el panel" usa `Action.OpenUrl` hacia `{APP_URL}/registros?ids=…`, o hacia `/alertas` para Mi día.
- El pie siempre dice quién la configuró y enlaza a `/alertas?tab=notificaciones`, para que quien la recibe sepa de dónde viene y pueda darse de baja.
- Tamaño máximo 256 KB. Se recorta la lista mucho antes de llegar ahí.

### 8.3 Bandeja en la app

Muestra el mismo contenido renderizado en HTML con las clases existentes, con estado leído o no leído.

## 9. Interfaz

### 9.1 Navegación

- El ítem del menú pasa de "Mi día y alertas" a **"Alertas y notificaciones"** (misma ruta `/alertas`).
- Pestañas: **Mi día** (lo actual), **Bandeja** y **Mis notificaciones**. Los admins ven además el filtro **Todas**.
- Cada pestaña se muestra según su permiso: Mi día con `viewAlertas` y las otras dos con `viewNotificaciones`.
- **Campana en la barra superior** con un contador rojo de las **notificaciones no leídas de este módulo** (consulta cada 60 s a `/bandeja/no-leidas`). Solo cuenta lo que alguien programó y configuró aquí; los pendientes de Mi día nunca suman. Sin no leídas, no hay punto rojo.

### 9.2 Pestaña "Mis notificaciones"

```
┌─ Alertas y notificaciones ──────────────────────────────────────────────────────────────┐
│  [ Mi día ]  [ Bandeja (3) ]  [ Mis notificaciones ]                                    │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│  Buscar…                    Ver: (Mías ▾)   Estado: (Todas ▾)      [ + Nueva notificación ]│
│ ┌─────────────────────────┬──────────────────────┬───────┬────────┬───────────┬────────┐│
│ │ Nombre                  │ Cuándo               │Canales│ Para   │ Última    │ Activa ││
│ ├─────────────────────────┼──────────────────────┼───────┼────────┼───────────┼────────┤│
│ │ Compras que vencen hoy  │ Cada día hábil · 7:00│ App ·T│ 3 pers.│ Hoy 7:00 ✓│   ●─   ││
│ │ Compras semana anterior │ Cada lunes · 8:00    │ App   │ Yo     │ Lun 8:00 ✓│   ●─   ││
│ │ Valoración de mis com…  │ Al radicar (fase 2)  │ T     │ Yo     │ —         │   ─○   ││
│ └─────────────────────────┴──────────────────────┴───────┴────────┴───────────┴────────┘│
│  Tamaño (25 ▾)        Página 1 de 1 · 3 notificaciones          [ Anterior ][ Siguiente ]│
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

- Tabla paginada con la convención de `RegistrosView.jsx`: `PAGE_SIZES`, Anterior y Siguiente, "Página X de Y" y total. Vuelve a la página 1 al cambiar un filtro.
- Los nombres largos se truncan con `desc-tooltip-wrap`.
- El interruptor "Activa" va **después** del texto, con el estilo global `.est-switch`.
- Con "Ver: Todas" (solo admins) aparece la columna **Propietario**.
- Menú ⋯ por fila: Ver historial, Editar, Probar ahora, Pausar o Reanudar, Duplicar, Eliminar (con confirmación).

### 9.3 Crear una notificación (modal en 3 pasos)

**Paso 1: el pedido**

```
┌─ Nueva notificación ─────────────────────────────────────────┐
│ ¿Qué quieres que te avise?                                   │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ Quiero que cada lunes me digas cuántas compras se         │ │
│ │ registraron la semana anterior                            │ │
│ └──────────────────────────────────────────────────────────┘ │
│ Ejemplos:  [Compras que vencen hoy]  [Resumen semanal]        │
│            [Proveedores desactualizados]  [Mis pendientes]    │
│                                              [ Continuar → ]  │
└──────────────────────────────────────────────────────────────┘
```

**Paso 2: preguntas de Nova** (una tarjeta por pregunta, con las respuestas como chips)

```
│ Nova: Entendí que cada lunes quieres el número de compras de la semana anterior. │
│                                                                                   │
│ ¿A qué hora?           ( 7:00 )  ( 8:00 )  ( 9:00 )  [ otra… ]                   │
│ Si el lunes es festivo ( Enviarlo el martes )  ( Enviarlo igual )  ( No enviar ) │
│ "Registradas" según    ( Fecha de solicitud )  ( Fecha en que se crearon )       │
│                                                         [ ← Atrás ] [ Listo → ]  │
```

**Paso 3: confirmar**

```
┌─ Así quedará ─────────────────────────────────────────────────────────┐
│ Cada lunes a las 8:00 a. m. (si es festivo, el martes) te digo cuántas │
│ compras se registraron la semana anterior, según la fecha de solicitud.│
│ Se envía aunque sean 0.                                                │
│                                                                        │
│ Próximos envíos: lun 20 oct · lun 27 oct · mar 4 nov (3 nov festivo)   │
│                                                                        │
│ Nombre    [ Compras de la semana anterior            ]                 │
│ Mensaje   [ La semana pasada ({periodo}) se registraron {total}        │
│             compras por {valor_total}.                    ]  ✎ Nova     │
│                                                                        │
│ Canales   En la app  ☑   Teams  ☑   Correo (deshabilitado) ☐           │
│ Para      [ Yo ✕ ] [ Usuario Demo 2 ✕ ] [ + Agregar ▾ ]                 │
│           Solo aparecen personas con acceso a Compras.                 │
│                                                                        │
│ ▸ Ver la regla técnica (editable)                                      │
│                                                                        │
│ [ Probar ahora ]               [ Guardar como borrador ] [ Activar ]   │
└────────────────────────────────────────────────────────────────────────┘
```

- Los checks de canal van **después** del texto.
- "Probar" ejecuta la consulta real y envía la prueba **a todos los destinatarios y a quien prueba**, por los canales marcados, con la etiqueta "PRUEBA · enviada por {nombre}". No cuenta como el envío del día. No existe en las notificaciones por evento.
- "Ver la regla técnica" abre un formulario manual (frecuencia, hora, festivo, consulta, filtros y condición), para ajustar sin volver a llamar a Nova.

### 9.4 Historial de una notificación

Tabla paginada de ejecuciones: fecha, origen (programada, prueba o recuperada), resultado (enviada, omitida por no haber resultados o error), ítems y entregas. Al expandir una fila se ve cada entrega: persona, canal, estado y motivo (p. ej. "omitida: ya no tiene acceso a Compras"). Esto responde la pregunta "¿por qué no me llegó?".

### 9.5 Bandeja

Lista paginada de lo recibido: título, resumen de una línea, de quién viene la notificación y fecha. Al hacer clic se expande y se marca como leída. Tiene "Marcar todas como leídas" y, en cada notificación de otro creador, "Dejar de recibir".

## 10. Teams: configuración y prueba local

Se usa la misma conexión ya probada (ver `docs/teams-notificaciones-fase2.md`): un webhook de la aplicación **Flujos de trabajo** (Power Automate) de Teams. No requiere permisos de IT.

**Cambio importante frente a ese documento:** ahí se proponía un flujo por rol. Aquí cada notificación va a **personas concretas**, así que se usa **un solo flujo** que recibe el correo del destinatario en el JSON y le escribe por chat con el bot de Flujos de trabajo.

### 10.1 Crear el flujo (una sola vez)

1. En Teams, abre la aplicación **Flujos de trabajo** (Workflows) → **Crear** → plantilla **"Publicar en un chat cuando se recibe una solicitud de webhook"** (*Post to a chat when a webhook request is received*).
2. Nombre: `Panel de Compras y Bienestar - Notificaciones`. Conecta tu cuenta y termina el asistente. Copia la **URL** que te muestra; es un secreto.
3. Abre el flujo en **Power Automate** (make.powerautomate.com → Mis flujos → Editar) y ajústalo:
   1. **Disparador** "Cuando se recibe una solicitud de webhook de Teams": déjalo como está.
   2. Agrega antes del bucle una acción **Condición** (validación del secreto compartido):
      - `triggerBody()?['clave']` **es igual a** el valor que pondrás en `TEAMS_CLAVE_FLUJO`.
      - **Y** `toLower(triggerBody()?['destinatario'])` **termina con** `@example.com`.
      - Rama **No**: acción **Terminar** con estado *Failed* y mensaje "Solicitud rechazada".
   3. En la rama **Sí** queda el bucle **Aplicar a cada uno** (sobre `triggerBody()?['attachments']`), con la acción **Publicar tarjeta en un chat o canal**:
      - Publicar como: **Flow bot**
      - Publicar en: **Chat with Flow bot**
      - Recipient: expresión `triggerBody()?['destinatario']`
      - Tarjeta adaptable: expresión `items('Apply_to_each')?['content']`. El nombre del bucle puede ser `For_each`; usa el que muestre tu flujo.
4. Guarda el flujo. En **Configuración → Propietarios**, agrega al menos un **copropietario**: el flujo corre con la cuenta de quien lo creó y deja de funcionar si esa cuenta se desactiva.
5. Si la URL se compartió por chat o quedó en un log, **regénérala**: borra el flujo y créalo de nuevo. El flujo de prueba "Mi Dia" sigue pendiente de borrar por esa razón.

### 10.2 Lo que envía la app

```json
{
  "clave": "<TEAMS_CLAVE_FLUJO>",
  "destinatario": "usuario@example.com",
  "type": "message",
  "attachments": [{
    "contentType": "application/vnd.microsoft.card.adaptive",
    "contentUrl": null,
    "content": { "$schema": "http://adaptivecards.io/schemas/adaptive-card.json", "type": "AdaptiveCard", "version": "1.4", "body": [] }
  }]
}
```

- Se hace un `POST` por destinatario, en secuencia y con 300 ms entre envíos, con `fetch` de Node, UTF-8 y un timeout de 10 s.
- La respuesta esperada es **202**. Un 202 significa "recibido", no "entregado": el resultado real queda en el historial de ejecuciones del flujo.
- Reintentos: ante 429 o 5xx, hasta 3 intentos (1, 5 y 15 min). Ante otro 4xx no se reintenta y la entrega queda en error con su motivo.
- El correo del destinatario sale de `User.email`.

### 10.3 Variables de entorno (`backend/.env`)

| Variable | Ejemplo | Uso |
|---|---|---|
| `TEAMS_MODO` | `desactivado` · `simulado` · `real` | `desactivado`: el canal aparece como "No configurado". `simulado`: arma la tarjeta y la guarda en la entrega y en el log del backend, sin enviarla. `real`: envía. |
| `TEAMS_WEBHOOK_URL` | `https://…powerplatform.com/…` | URL del flujo (secreto) |
| `TEAMS_CLAVE_FLUJO` | cadena aleatoria de 32 caracteres | Secreto compartido que el flujo valida |
| `TEAMS_DESTINO_PRUEBA` | `usuario@example.com` | **Solo en local**: si está definida, **todo** envío a Teams se redirige a ese correo, con la etiqueta "[LOCAL → era para X]". Evita escribirle a compañeros con datos de la BD local. **Fuera de producción es obligatoria: sin ella no se envía nada a Teams.** |
| `APP_URL` | `http://localhost:3000` | Base de los enlaces "Ver en el panel" |
| `TZ` | `America/Bogota` | Hora local del programador. **Obligatoria en producción.** |

`GET /api/notificaciones/canales` informa a la UI el estado de cada canal (`{ app: true, teams: "real" | "simulado" | "desactivado", correo: false }`) sin exponer la URL.

### 10.4 Probar en local, paso a paso

La app solo hace llamadas **salientes** a Power Automate, así que en local no hace falta ningún túnel.

1. Crea el flujo (§10.1).
2. En `backend/.env`:
   ```
   TEAMS_MODO=real
   TEAMS_WEBHOOK_URL=<la URL>
   TEAMS_CLAVE_FLUJO=<una clave aleatoria>
   TEAMS_DESTINO_PRUEBA=usuario@example.com
   APP_URL=http://localhost:3000
   ```
3. Prueba la conexión sola: `npm run teams:probar` (desde `backend/`, script nuevo con Node `fetch`) envía una tarjeta de prueba con tildes y eñes ("Prueba de conexión: compras, ñandú, José"). Debe responder 202 y debe llegarte un chat del bot de Flujos de trabajo.
4. Si no llega: revisa el **historial de ejecuciones** del flujo en Power Automate. Errores conocidos:
   - "Parámetros no válidos": la tarjeta adaptable está vacía; revisa la expresión del bucle.
   - "Solicitud rechazada": `clave` o `destinatario` no coinciden.
   - `Call made for a thread which is not a ChatThread`: el destino no es válido.
5. Levanta backend y frontend, crea una notificación, márcale Teams y usa **Probar ahora**.
6. Para probar el programador sin esperar: crea una regla diaria con la hora en el minuto siguiente. El historial de la notificación debe mostrar la ejecución y la entrega por Teams.
7. Antes de producción: confirma que el servidor tiene salida HTTPS a `*.environment.api.powerplatform.com:443`, quita `TEAMS_DESTINO_PRUEBA`, define `TZ` y crea el flujo definitivo con copropietarios.

Nunca pruebes con `curl` desde PowerShell o Git Bash: envía las tildes en una codificación que no es UTF-8 y el webhook responde 400. Usa siempre el script de Node o la app.

## 11. Modelo de datos

Todas las tablas son nuevas: `id` entero autoincremental, `createdAt`, `creadoPorUserId` y `creadoPorNombre`, protegidas con `SELECT proteger_texto_tabla('<tabla>');` en la misma migración. Las referencias a `User` no tienen FK y guardan un snapshot del nombre, como el resto del esquema.

```prisma
model Notificacion {
  id                 Int       @id @default(autoincrement())
  nombre             String
  pedido             String    // lo que escribió la persona
  aclaraciones       String?   // JSON: [{ pregunta, respuesta }] del diálogo con Nova
  disparador         String    // "programado" | "evento"
  evento             String?   // fase 2: "compra.valorada", …
  agrupacion         String?   // fase 2: "inmediato" | "cada_15_min" | "resumen_diario"
  fuente             String    // "compras" | "mi_dia" | "proveedores" | "presupuesto"
  consulta           String    // clave del catálogo (§6.1)
  parametros         String    @default("{}") // JSON validado contra el catálogo
  alcance            String    @default("general") // "general" | "personal"
  condicion          String    @default("si_hay_resultados") // "siempre" | "si_hay_resultados" | "umbral"
  umbral             Int?
  frecuencia         String?   // mismas de lib/reportSchedule.js
  diaSemana          Int?
  diaMes             Int?
  ordinal            Int?
  fechaUnica         String?
  hora               String?   // "HH:mm", hora de Colombia
  siFestivo          String    @default("correr") // "correr" | "enviar" | "omitir"
  sabadoHabil        Boolean   @default(false)
  domingoHabil       Boolean   @default(false)
  titulo             String
  plantilla          String
  canales            String    @default("[\"app\"]") // JSON: ["app","teams"]
  estado             String    @default("activa") // "borrador" | "activa" | "pausada" | "pausada_por_permisos"
  motivoPausa        String?
  pausadaPorUserId   String?
  pausadaPorNombre   String?
  pausadaAt          DateTime?
  propietarioUserId  String    // dueño; los permisos se evalúan con su rol
  propietarioNombre  String
  ultimaEjecucionAt  DateTime?
  ultimoResultado    String?   // "enviada" | "omitida" | "error"
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt
  creadoPorUserId    String?
  creadoPorNombre    String?
  destinatarios      NotificacionDestinatario[]
  ejecuciones        NotificacionEjecucion[]

  @@index([estado, disparador])
  @@index([propietarioUserId])
  @@map("notificaciones")
}

model NotificacionDestinatario {
  id              Int          @id @default(autoincrement())
  notificacionId  Int
  notificacion    Notificacion @relation(fields: [notificacionId], references: [id], onDelete: Cascade)
  userId          String
  userNombre      String
  deBaja          Boolean      @default(false) // "Dejar de recibir"
  deBajaAt        DateTime?
  createdAt       DateTime     @default(now())
  creadoPorUserId String?
  creadoPorNombre String?

  @@unique([notificacionId, userId])
  @@index([userId])
  @@map("notificacion_destinatarios")
}

model NotificacionEjecucion {
  id               Int          @id @default(autoincrement())
  notificacionId   Int
  notificacion     Notificacion @relation(fields: [notificacionId], references: [id], onDelete: Cascade)
  clave            String       @unique // idempotencia: "n12|2026-10-20" o "n12|evt:345" o "n12|prueba|<ts>"
  origen           String       // "programado" | "recuperado" | "evento" | "prueba"
  estado           String       // "enviada" | "omitida_sin_resultados" | "parcial" | "error"
  resultados       Int          @default(0)
  contenido        String?      // JSON: snapshot de título, texto e ítems tal como salieron
  error            String?
  retrasoMin       Int?         // si salió tarde (servidor apagado a la hora)
  createdAt        DateTime     @default(now())
  creadoPorUserId  String?      // null = programador
  creadoPorNombre  String?      // "Programador de notificaciones" o quien probó
  entregas         NotificacionEntrega[]

  @@index([notificacionId, createdAt])
  @@map("notificacion_ejecuciones")
}

model NotificacionEntrega {
  id              Int                   @id @default(autoincrement())
  ejecucionId     Int
  ejecucion       NotificacionEjecucion @relation(fields: [ejecucionId], references: [id], onDelete: Cascade)
  userId          String
  userNombre      String
  canal           String                // "app" | "teams"
  estado          String                // "pendiente" | "enviada" | "error" | "omitida"
  motivo          String?               // "sin acceso a Compras", "HTTP 400", …
  intentos        Int                   @default(0)
  proximoIntento  DateTime?
  enviadaAt       DateTime?
  leidaAt         DateTime?             // solo canal "app"
  createdAt       DateTime              @default(now())
  creadoPorUserId String?
  creadoPorNombre String?

  @@index([userId, canal, leidaAt])
  @@index([estado, proximoIntento])
  @@map("notificacion_entregas")
}

// Fase 2: bandeja de salida de eventos (outbox)
model EventoNotificacion {
  id              Int       @id @default(autoincrement())
  tipo            String    // "compra.legalizada", …
  entidadId       String    // id del registro / NIT
  datos           String    // JSON con el antes y el después mínimos
  procesadoAt     DateTime?
  createdAt       DateTime  @default(now())
  creadoPorUserId String?   // quien hizo el cambio
  creadoPorNombre String?

  @@index([procesadoAt])
  @@map("eventos_notificacion")
}
```

La **bandeja** de una persona son sus `NotificacionEntrega` con `canal = "app"`. No hace falta otra tabla.

Retención: las ejecuciones y entregas de más de 180 días se purgan una vez al día. El historial reciente basta para diagnosticar.

## 12. Backend

### 12.1 Archivos

| Archivo | Responsabilidad |
|---|---|
| `lib/notificaciones.js` | CRUD, validación (`validarRegla`), destinatarios, pausar y reanudar, baja, auditoría |
| `lib/notificacionesCatalogo.js` | Catálogo puro de fuentes, consultas, parámetros, eventos y variables. Lo usan la validación, Nova y la UI (copia en `frontend/lib/notificacionesCatalogo.js`, como `maestrosTipos`) |
| `lib/notificacionesPermisos.js` | `puedeVerFuente`, `destinatariosElegibles`, `puedeGestionar(user, notif)` (propietario o admin) |
| `lib/notificacionesConsultas.js` | Las consultas deterministas de §6.1 |
| `lib/notificacionesMensaje.js` | Plantilla → texto para la app y tarjeta Adaptive para Teams; escapa y recorta |
| `lib/notificacionesNova.js` | `interpretarPedido`, `preguntasFaltantes`, `redactarPlantilla` |
| `lib/notificacionesMotor.js` | `ejecutar(notif, { origen, prueba })`: revalida permisos, consulta, evalúa la condición, crea la ejecución (clave única) y las entregas, y despacha |
| `lib/notificacionesScheduler.js` | Revisión cada minuto (patrón de `reportScheduler.js`), reintentos de Teams y purga diaria; se arranca en `instrumentation.js` |
| `lib/teams.js` | `enviarTarjeta(destinatario, tarjeta)`, `estadoTeams()`; aplica `TEAMS_MODO` y `TEAMS_DESTINO_PRUEBA`; nunca registra la URL |
| `scripts/teams/probarConexion.mjs` | `npm run teams:probar` |

### 12.2 Programador

En cada minuto, por cada notificación `activa` y `programado`:

1. Si ya pasó su `hora` de hoy y `esFechaDeEnvio(notif, hoy)` (con `siFestivo` mapeado, §4.1).
2. Calcula `clave = "n{id}|{YYYY-MM-DD}"` y la inserta con la ejecución. Si choca con la restricción única, ya se ejecutó: **no hay duplicados** aunque el servidor se reinicie o corran dos procesos.
3. Si salió más de 30 min tarde (servidor apagado), `origen = "recuperado"` y el mensaje lleva "(enviado con retraso)". Los días que pasaron completos con el servidor apagado **no se recuperan**, porque llegarían datos viejos. Quedan sin ejecución, y el historial lo deja ver.
4. Hay un candado en memoria por notificación (`enCurso`) para no lanzar dos veces la misma en el mismo minuto.

### 12.3 API (todas con `requirePermission("viewNotificaciones")`)

| Método | Ruta | Uso |
|---|---|---|
| GET | `/api/notificaciones?ver=mias\|todas&estado=&q=&page=&size=` | Lista paginada. `todas` solo para admin |
| POST | `/api/notificaciones/nova/interpretar` | Diálogo con Nova (§5) |
| POST | `/api/notificaciones/nova/plantilla` | Redactar o ajustar el mensaje |
| GET | `/api/notificaciones/destinatarios-elegibles?fuente=` | Usuarios activos con acceso |
| GET | `/api/notificaciones/canales` | Estado de app, Teams y correo |
| GET | `/api/notificaciones/proximas?…regla` | Próximas 5 fechas (vista previa) |
| POST | `/api/notificaciones` | Crear |
| GET / PUT / DELETE | `/api/notificaciones/[id]` | Detalle, editar, eliminar (propietario o admin) |
| POST | `/api/notificaciones/[id]/estado` | `{ accion: "pausar" \| "reanudar" }` |
| POST | `/api/notificaciones/[id]/probar` | Prueba a todos los destinatarios y a quien prueba, marcada como PRUEBA (no aplica a eventos) |
| POST | `/api/notificaciones/[id]/enviar` | Envío manual inmediato a todos los destinatarios (origen `manual`, clave `n{id}\|manual\|{ts}`) |
| POST | `/api/notificaciones/[id]/baja` | El destinatario deja de recibir |
| GET | `/api/notificaciones/[id]/ejecuciones?page=` | Historial con entregas |
| GET | `/api/notificaciones/bandeja?page=&soloNoLeidas=` | Bandeja propia |
| GET | `/api/notificaciones/bandeja/no-leidas` | Número para la campana |
| POST | `/api/notificaciones/bandeja/leer` | `{ ids }` o `{ todas: true }` |

Los errores se devuelven con `apiError`: 400 si la regla no es válida, 403 si es por permisos (con el mensaje de seguridad) y 404 si no existe.

### 12.4 Auditoría

- `entityType: "notificacion"`, con `recordId` igual al id de la notificación.
- Acciones: `crear`, `editar`, `eliminar`, `pausar`, `reanudar`, `probar`, `baja` (un destinatario deja de recibir) y `alta` (vuelve a recibir). Las nuevas se agregan a `ACTION_LABELS`. El cambio de destinatarios al editar queda en el diff como lista de nombres antes y después.
- `logNotificacionCreate/Update/Delete/Estado` en `lib/audit.js`, con `NOTIFICACION_FIELD_LABELS` en `lib/auditLabels.js` y su copia en el frontend. Los destinatarios se registran como lista de nombres. Las llamadas son fire-and-forget (`.catch(() => {})`).
- Cuando un admin pausa o elimina la notificación de otra persona, el registro lo deja claro ("Pausada por Usuario Demo 2 (admin)") y la persona lo ve en su tabla.
- Los envíos **no** van a auditoría, por volumen. Su historial es `NotificacionEjecucion` y `NotificacionEntrega`.
- La pausa automática por permisos se audita con el actor "Sistema".

### 12.5 Otros cambios

- `lib/permissions.js` y ambas copias de `lib/roles.js`: feature `viewNotificaciones` y `canViewNotificaciones`.
- `lib/reportSchedule.js`: soporte de `siFestivo: "omitir"` sin cambiar el comportamiento de Informes.
- `lib/appGuide.js`: sección para que Nova sepa explicar el módulo.
- `CLAUDE.md`: sección del módulo y cambio de "Teams is the next phase".
- `npm run db:verificar-texto` debe pasar con las tablas nuevas.

## 13. Frontend

| Archivo | Contenido |
|---|---|
| `app/(app)/alertas/page.js` | Pestañas según permisos; `?tab=` |
| `components/alertas/BandejaView.jsx` | Bandeja paginada |
| `components/notificaciones/NotificacionesView.jsx` | Tabla paginada, filtros, columna Propietario para admin |
| `components/notificaciones/NuevaNotificacionModal.jsx` | Los 3 pasos (§9.3) |
| `components/notificaciones/PreguntasNova.jsx` | Tarjetas de pregunta con chips |
| `components/notificaciones/ReglaManual.jsx` | Edición técnica sin Nova |
| `components/notificaciones/DestinatariosPicker.jsx` | Solo usuarios elegibles |
| `components/notificaciones/HistorialModal.jsx` | Ejecuciones y entregas |
| `components/CampanaNotificaciones.jsx` | Contador en la barra superior y menú con las 5 últimas y "Ver todas" |
| `Sidebar.jsx` | Ítem renombrado a "Alertas y notificaciones" |

Se reutilizan las clases existentes (`table-card`, `table-footer`, `modal-*`, `est-switch`, `check-row`, `desc-tooltip-*`) y no se agregan estilos de checkbox propios.

## 14. Fases

| Fase | Alcance | Criterio de terminado |
|---|---|---|
| **1** | Modelo y migración, catálogo y consultas de §6.1, Nova (interpretar y plantilla), programador, app y Teams, bandeja, campana, pestaña Mis notificaciones, historial, permisos, auditoría, script `teams:probar` | Los ejemplos 2, 3, 4 y 5 de §1 funcionan de punta a punta en local, y la tarjeta llega por Teams con tildes correctas |
| **2** | Eventos (outbox y publicación desde `records`, `valoraciones` y `proveedoresCiclo`), agrupación | El ejemplo 1 funciona; 20 legalizaciones seguidas llegan como un solo resumen |
| **3** | Correo cuando se libere SMTP; Nova resume ("{resumen_nova}") opcional | — |

### Orden de trabajo de la fase 1

1. Migración y modelo, más `proteger_texto_tabla`.
2. Catálogo, permisos y consultas, con pruebas manuales con Node sobre la BD local.
3. `lib/teams.js` y `teams:probar`, para validar el flujo antes de tener interfaz.
4. Motor y programador.
5. API y auditoría.
6. Nova (interpretar, preguntas obligatorias, plantilla).
7. Interfaz: pestaña, modal, bandeja, campana e historial.
8. Documentación (`CLAUDE.md`, `appGuide.js`) y `db:verificar-texto`.

## 15. Riesgos y cómo se cubren

| Riesgo | Mitigación |
|---|---|
| El servidor está apagado a la hora programada | Recuperación el mismo día, con aviso de retraso; el historial deja ver los días sin ejecución |
| El flujo de Teams deja de funcionar (cuenta del creador desactivada) | Copropietarios. La entrega queda en error con su motivo y la app siempre entrega igual en la bandeja |
| 202 de Teams sin entrega real | Historial de ejecuciones en Power Automate; la bandeja de la app es la fuente confiable |
| Nova interpreta mal | Resumen en lenguaje claro, próximas fechas, "Probar ahora" y regla técnica visible antes de activar |
| Fuga de datos a quien no debe verlos | Validación al crear y en **cada** ejecución; destinatarios filtrados por permiso |
| Envíos duplicados | Restricción única `clave` por ejecución |
| Exceso de mensajes | Límites por persona y por notificación; frecuencia mínima diaria; agrupación de eventos en la fase 2 |
| Hora equivocada en producción | `TZ=America/Bogota` obligatoria; se revisa al arrancar y se registra una advertencia si falta |

## 16. Decisiones confirmadas (2026-10-17)

1. Menú renombrado a **"Alertas y notificaciones"**. La campana muestra en rojo solo las no leídas de este módulo.
2. Límites: **10** notificaciones creadas por persona (en cualquier estado) y **6** destinatarios.
3. **Un solo flujo** de Teams, con validación de `clave` y del dominio `@example.com`.
4. Los destinatarios pueden darse de baja. La baja, la nueva suscripción y cualquier cambio de destinatarios quedan en auditoría (`entityType: "notificacion"`, acciones `baja` y `alta`).
