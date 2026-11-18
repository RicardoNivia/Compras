# Módulo Consumo

Servicios públicos por sede (energía, acueducto y alcantarillado, gas y aseo). Módulo **independiente** de Compras, Bienestar y Tesorería: tablas, permisos, maestros y menú propios; no cruza pagos con Tesorería (decisión del usuario, noviembre de 2026: «por ahora debe quedar aparte de todo»). Las convenciones generales siguen en `CLAUDE.md`.

Se construye por fases. **Hechas: fase 1 (base), fase 2 (recibos a mano), fase 3 (subir con Nova), dashboard y auditoría del contador, y agentes + herramientas de Nova (ver «Agentes»).** Pendiente: ficha de sede y reportes. El mockup aprobado (6 pantallas) está en el artifact «Módulo Consumo · mockup».

## Acceso

- Por ROL en la Matriz (pestaña **Consumo**): `verConsumo` (consulta) / `registrarConsumo` (registro) / `administrarConsumo` (admin: sedes, cuentas, medidores, empresas, eliminar). Por defecto solo admin.
- `backend/lib/consumo/comun.js#accesoConsumo(user)` → `{ nivel, puedeRegistrar, puedeAdministrar }` o `null`; `ruta.js#conConsumo(nivel, fn)` envuelve todas las rutas `/api/consumo/*` (niveles `consulta` / `registro` / `admin`).
- `/api/auth/me` devuelve `consumo`; las páginas redirigen a `/` si es `null` y el menú usa `permite: (u) => !!u.consumo`.

## Modelo (`consumo_*`, ids Int, columnas de creador, protegidas contra U+FFFD)

- **`SedeConsumo`**: nombre (único, sin importar tildes ni signos: `claveNombre`), edificio (agrupa), dirección, ciudad, activo. La migración `consumo_base` crea las 10 sedes iniciales (9 de los recibos de ejemplo + Mesa de Yeguas).
- **`EmpresaConsumo`**: nombre, NIT, `servicios` (lista separada por comas), activo. Iniciales: Enel Colombia, Acueducto de Bogotá (EAAB), Vanti, Promoambiental Distrito.
- **`CuentaConsumo`** (sede + servicio): empresa, `numeroCuenta`, titular, clase de uso, estrato, periodicidad (mensual / bimestral), `direccionRecibo` (como la escribe la empresa), `noAplica`, activo.
  - Una sede puede tener **varias cuentas del mismo servicio** (Mesa de Yeguas tiene dos de energía por el cambio de medidor).
  - El número de cuenta **no se repite dentro del mismo servicio** (`claveNumero`: solo letras y dígitos, «7174172-4» = «71741724»): es lo que identifica la sede de un recibo.
  - `noAplica` = la sede no tiene ese servicio (no se reporta como recibo faltante); no convive con una cuenta real del mismo servicio.
- **`MedidorConsumo`**: número, factor, desde / hasta. Se envían todos en `medidores` al crear o editar la cuenta (se sincronizan; uno con recibos no se quita, se le pone «hasta»).
- **`ReciboConsumo`** + **`CargoReciboConsumo`** + **`HistorialReciboConsumo`** + **`SoporteReciboConsumo`** + **`HallazgoConsumo`**: tablas ya creadas, **todavía sin código** (fases 2 a 5). `ReciboConsumo.extras` (JSON) guarda todo lo que trae el recibo y el informe no usa. El aseo llega dentro del recibo de energía y se guarda como cargo de grupo `aseo`, sin sumarse al costo de la energía.
- Lo que se **calcula y no se guarda**: consumo y costo por día, variaciones, costo efectivo por unidad, saldo pendiente y el reparto del cambio entre consumo, tarifa y otros cargos (las columnas con fórmula del Excel del contador).

## Recibos (fase 2: `lib/consumo/recibos.js`, `/api/consumo/recibos[/{id}[/pago|/soportes]]`, `/api/consumo/soportes/{id}`)

- Un recibo = una cuenta + un período. Se crea con `cuentaId`, o con `cuenta` (sedeId, servicio, numeroCuenta…) y la cuenta queda creada en la sede que eligió la persona. El medidor va por `medidorId` o por número (`medidor`, se agrega a la cuenta si no estaba).
- Se calcula al guardar si no viene: días (de las fechas), mes de reporte (el del fin del período), consumo ((actual − anterior) × factor), total cargos (suma de `cargos`) y total a pagar (cargos + saldo anterior; el saldo a favor va negativo).
- No se duplica: misma factura o mismo período en la cuenta → 400.
- `todos()` arma lo calculado en memoria: `costoServicio` (total cargos **sin** los cargos de grupo `aseo`), `consumoDia`, `costoDia`, `costoUnidad`, `vencido`, `saldo` y las variaciones (`varConsumo`, `varUnitario`, `varTotal`, `varConsumoDia`) frente al período anterior de la **misma sede y servicio**, aunque haya cambiado de cuenta o medidor (como el Excel). Comprobado contra el Excel de Mesa de Yeguas.
- Pago a mano (`POST /recibos/{id}/pago`): pendiente / pagado (valor y fecha opcional) / saldo_favor. «Vencido» no se guarda: es pendiente con pago oportuno pasado.
- Soportes: PDF o foto, validados con `agenteCotizador.js#prepararArchivo`, sin repetir el mismo archivo en el recibo.
- Permisos: listar y abrir = consulta; crear, editar, pago y soportes = registro; eliminar el recibo = admin. Auditado como `reciboConsumo` y `soporteReciboConsumo`.
- Frontend: `/consumo/recibos` (`RecibosConsumo.jsx`: pestañas por servicio con contador, filtros, totales del filtro, tabla paginada en el servidor, Excel con todas las columnas) y `ReciboModales.jsx` (`FormReciboModal` de 4 pasos con el resumen en vivo; `DetalleReciboModal` con pago, cargos, soporte y todos los datos).

## Subir con Nova (fase 3: `lib/consumo/lectura.js`, `POST /api/consumo/recibos/leer`, `/consumo/subir`, `SubirRecibos.jsx`)

- `leerRecibo({ buffer, nombre })` no guarda nada: Nova extrae el recibo con un esquema (datos, `cargos` por grupo, `historial` de períodos anteriores, `extras` como pares nombre/valor, `dudas`) y el CÓDIGO hace el resto: `proponerSede` (cuenta ya asociada = confianza alta; medidor o dirección = media; si no, ninguna), duplicados (mismo archivo por sha1 —sin gastar lectura—, o misma factura/período en la cuenta) y `comprobar` (lecturas = consumo, suma de cargos = total, total + saldo = total a pagar, días).
- La pantalla lee los archivos de a uno; **«Guardar recibo» está deshabilitado hasta que la persona confirma la sede** («Sí, asociar a esta sede» o elegir otra). Al guardar llama a `POST /recibos` con `origen: "nova"`, `historial` y `extras`, y adjunta el archivo como soporte. Una cuenta nueva queda creada en la sede elegida con la dirección del recibo.
- **Modelo propio para leer recibos: `CONSUMO_MODELO_RECIBOS`, por defecto `claude-sonnet-4-6`** (`lectura.js#leerConModelo`). Probado en noviembre de 2026: Claude Haiku 4.5 (el modelo de la app) **inventa** cuenta, consumo y total en los escaneados girados de Enel, con cifras que cuadran entre sí y pasan las comprobaciones; Sonnet 4.6 los lee bien. Si la clave no permite ese modelo (401/403/404) o no responde, cae al de la app y agrega una duda «compara las cifras con el archivo». **Antes de desplegar, confirmar que la clave de producción permite `claude-sonnet-4-6`** (el intento del 2026-11-05 con Opus/Sonnet en producción dio 401). Costo aproximado: USD 0,05–0,08 por recibo.
- `anthropic.js#generateAnthropicJson` acepta una frase antes o después del JSON (Sonnet a veces la escribe).

## Agentes (`lib/consumo/agentes.js`, `reclamaciones.js`, `novaConsumo.js`, página `/consumo/agentes`, `AgentesConsumo.jsx`)

Mismo diseño que los agentes de Compras, Bienestar y Tesorería (ag-hero, ag-selector, CabezaAgente, tarjetas `ag-propuesta conf-*`). Migración `consumo_agentes` (columnas nuevas en `consumo_hallazgos`).

- **Recibos faltantes** (`recibosFaltantes`, `GET /api/consumo/agentes/faltantes`, sin IA, no se guarda): por cuenta activa (no «no aplica», sede activa) el largo del período es la mediana de los días de sus recibos (sin datos, la periodicidad). Tipos: `atrasado` (cerró al menos un período y pasaron `GRACIA_DIAS` = 20 días), `hueco` (entre dos recibos quedó medio período o más), `sin_recibos`, `reemplazada` (otra cuenta del mismo servicio en la sede siguió recibiendo recibos: cambio de cuenta o medidor, como Mesa de Yeguas; solo sugiere desactivarla, no es un faltante).
- **Hallazgos** (`revisarHallazgos`, `GET/POST /api/consumo/agentes/hallazgos`, `POST /hallazgos/{id}` resolver | descartar (nota obligatoria) | reabrir): corre `analisis.js#auditoria(filtro, precargados)` en cada sede y servicio (sin aseo; lo INFORMATIVO se queda en la auditoría), separa la lectura estimada por recibo y suma anomalías del último año frente a los (hasta 6) recibos anteriores: `consumo_alto` (consumo/día ≥ +30 % y > 2 desviaciones) y `costo_unidad` (≥ +20 %). Cada hallazgo se guarda una vez por `clave` (`tipo|s{sede}|{servicio}|{id}`) con `nivel` (urgente/alta/media/baja), `confianza` y `valor` en juego; si deja de cumplirse se cierra solo (`resueltoPorNombre` «Nova · agente de hallazgos: ya no aplica») y se reabre si vuelve; lo que cerró una persona no se reabre. Corre al pedirlo, 2,5 s después de crear/editar/pagar/borrar un recibo (solo esa sede y servicio, `recibos.js#revisarDespues`) y, si la última revisión completa fue hace más de 6 h, al listar.
- **Reclamaciones** (`POST/PATCH /api/consumo/agentes/hallazgos/{id}/reclamacion`): para los tipos de `RECLAMABLES` (todos menos `vencido`) Nova (`generateStructuredJson`, sin caché) redacta la carta solo con los datos de la base y cita solo los artículos de la Ley 142 de 1994 de `NORMAS`; lo que no sabe va entre corchetes y en `datosFaltantes`. Se edita, se copia o descarga (.txt) y se marca radicada con número y fecha. Nada se envía desde la app.
- **Mi día**: secciones `conFaltantes` (atrasados y huecos recientes) y `conHallazgos` (abiertos urgentes y altos), `roles: ["*"]` + `verConsumo`, dominio `consumo`.
- **Nova** (`novaConsumo.js`): `resumen_consumo`, `buscar_recibos_consumo`, `recibos_faltantes_consumo`, `hallazgos_consumo`; solo con `accesoConsumo`, re-chequeado en cada llamada, nunca en el MCP. El moderador reconoce Consumo como tema.
- Permisos: consultar = consulta; revisar, resolver y reclamaciones = registro. Auditoría: `hallazgoConsumo`, `agenteHallazgosConsumo` (cada revisión que crea, cierra o reabre algo, y toda revisión a pedido) y `reclamacionConsumo`.

## Carga inicial en producción (`backend/prisma/consumo-inicial/`)

- `exportar.mjs` (solo contra la BD local) escribe `datos.json` (sedes, empresas, cuentas, medidores, recibos, cargos, historial) y `archivos/<sha1>.pdf` con lo que haya en Consumo. Se versiona en el repositorio.
- `cargar.mjs` corre en **cada arranque del contenedor** (CMD del `backend/Dockerfile`, después de `prisma migrate deploy`): solo actúa la primera vez por versión de los datos (marca en Auditoría: `entityType = "cargaInicialConsumo"`, `recordId` = huella de `datos.json`), reutiliza lo que ya exista y salta recibos repetidos (factura o período). Si falla, no se marca y la app arranca igual. `--simular` muestra qué haría.
- Para mandar más datos: cargarlos en local, volver a correr `exportar.mjs` (nueva huella) y desplegar; en producción solo se agrega lo que falte.

## Reglas de negocio

- **La sede de un recibo siempre la confirma una persona.** Nova la propone por cuenta, medidor y dirección según el historial; sin confirmar no se guarda. Si la cuenta es nueva, la persona elige la sede y la cuenta queda recordada.
- Una sede o cuenta con recibos no se borra: se desactiva. Una sede sin recibos se borra con sus cuentas. Una empresa usada por cuentas no se borra.
- Dinero con ISO 4217 («COP 1.234.567») y `MoneyInput`; el módulo nace con esa regla.

## Código

- Backend: `lib/consumo/{comun,ruta,maestros}.js`, `app/api/consumo/maestros` (`GET`), `/maestros/{tipo}` (`POST`), `/maestros/{tipo}/{id}` (`PATCH`, `DELETE`), con `tipo` = `sede` | `empresa` | `cuenta`.
- Auditoría: `audit.js#logConsumo` con las entidades `sedeConsumo` / `empresaConsumo` / `cuentaConsumo` (etiquetas en las dos copias de `auditLabels.js`). **Cada entidad nueva del módulo se agrega a `CONSUMO_LABELS`.**
- Frontend: `lib/consumoApi.js`, `components/consumo/` (`comun.jsx`: `SERVICIOS`, `PuntoServicio`, `EtiquetaServicio`, `Modal` con `.con-tema`, `Interruptor`; `ResumenConsumo`, `SedesConsumo`, `MaestrosConsumo`), páginas `/consumo`, `/consumo/sedes`, `/consumo/maestros`.
- Diseño: tema cobre `data-modulo="consumo"` (`--marca-consumo`, esquinas de 16 px, marcas de medidor en la cabecera, gotas que caen en el menú). Cada servicio tiene su color (`--c-energia`, `--c-acueducto`, `--c-gas`, `--c-aseo`) y **el color nunca va solo**: siempre con el nombre. Clases `con-*` al final de `globals.css`. Los modales llevan `.con-tema` porque se dibujan en `<body>`.
