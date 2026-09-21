# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Todo lo que se maneje en este repositorio (código, comentarios, commits, documentación, respuestas) debe estar en español.

## Comandos

```bash
npm install       # instala dependencias; postinstall corre `prisma generate`
npm run dev        # levanta el servidor de desarrollo de Next.js (http://localhost:3000)
npm run build      # build de producción
npm start          # corre el build de producción

npm run db:migrate # crea/aplica una migración de Prisma en desarrollo (pide un nombre)
npm run db:deploy  # aplica las migraciones existentes, no interactivo (usar en producción)
npm run db:seed    # carga prisma/seed-records.json vía prisma/seed.js (upsert, se puede correr varias veces)
npm run db:studio  # interfaz visual de Prisma Studio para la base de datos
```

No hay suite de tests ni linter más allá de `next lint`. `npm run lint` corre la configuración por defecto de ESLint de Next.js.

## Arquitectura

Este proyecto es una reescritura en Next.js (App Router) de un panel HTML estático heredado (`Panel_de_Compras_-_Sinco.html`). La reescritura deja casi toda la lógica original del front-end intacta y solo cambia su fuente de datos: de un bloque JSON embebido en `<script id="app-data">` a una base de datos real consultada a través de Prisma. Entender esa separación es clave para trabajar en este repo:

- **`prisma/schema.prisma`** — un único modelo, `PurchaseRecord` (mapeado a la tabla `purchase_records`), sobre **SQLite** (archivo `prisma/dev.db`, cuya ruta se define con `DATABASE_URL` en `.env`). Todos los campos salvo `id`/`createdAt`/`updatedAt` son strings, fechas o floats opcionales — la validación ocurre en el código de la aplicación, no en el schema.
- **`lib/prisma.js`** — singleton de `PrismaClient`, cacheado en `globalThis` para sobrevivir los hot reloads del modo desarrollo.
- **`lib/records.js`** — la única capa de traducción entre las filas de Prisma y el formato JSON que espera el front-end heredado: `toClientRecord` (BD → cliente, las fechas se convierten a strings `"YYYY-MM-DD"`) y `fromClientPayload` (cliente → BD, hace la única validación real: `descripcion` es obligatoria). Cualquier columna nueva debe agregarse en tres lugares: `schema.prisma`, `lib/records.js` (ambas funciones) y el front-end (ver más abajo).
- **`app/api/records/route.js`** (GET listar / POST crear) y **`app/api/records/[id]/route.js`** (PUT actualizar / DELETE eliminar) — wrappers REST delgados sobre Prisma + `lib/records.js`. Ambas rutas son `export const dynamic = "force-dynamic"` porque nunca deben cachearse de forma estática.
- **`app/page.js`** — Server Component; consulta todos los registros en cada solicitud (ordenados por `fechaSolicitud`, `createdAt`) y se los pasa al cliente como `initialRecords`. Si falla la BD, lo registra en el log y sigue con una lista vacía en vez de tumbar la página.
- **`app/PanelCompras.jsx`** — componente cliente que conecta los datos del Server Component con la app heredada en JS plano: define `window.__INITIAL_STATE__ = { records, meta }` (reemplazando el antiguo `<script id="app-data">` embebido), luego carga en orden secuencial los scripts de `public/vendor/` (jsPDF → plugin autoTable de jsPDF → html2canvas → `app-logic.js`; el orden importa porque `app-logic.js` espera que `window.jspdf`/`window.html2canvas` ya existan), y finalmente muestra el HTML inyectado.
- **`app/panelShellHtml.js`** — el HTML original del panel (topbar, dashboard, filtros, tabla, modales) como un string plano, inyectado vía `dangerouslySetInnerHTML`. Ya no tiene datos embebidos.
- **`public/vendor/app-logic.js`** (~2000 líneas) — la lógica heredada de la aplicación (filtros, orden, gráficos, exportar CSV/PDF/Word, el modal de agregar/editar). Al cargar lee `window.__INITIAL_STATE__` (con fallback al antiguo script `#app-data` si existe) y habla con el backend con `fetch` a `/api/records` (crear) y `/api/records/:id` (actualizar/eliminar) en vez de solo mutar estado en memoria. Para cambiar el comportamiento de la UI, casi siempre hay que tocar este archivo — se carga como un `<script>` plano, no como módulo ES empaquetado, así que usa `var`/funciones globales en vez de imports.
- **`prisma/seed.js`** + **`prisma/seed-records.json`** — cargador único de los 479 registros originales del panel, con upsert por su id original (`c1`, `c2`, ...) para que el seed se pueda correr varias veces sin duplicar.

### Agregar un campo nuevo de punta a punta

1. Agrega la columna en `prisma/schema.prisma`, corre `npm run db:migrate`.
2. Mapéala en ambas direcciones en `lib/records.js`.
3. Agrega el campo/columna del formulario en `app/panelShellHtml.js` y la lógica de lectura/escritura correspondiente en `public/vendor/app-logic.js`.

### Notas sobre la base de datos

SQLite vive completo en un solo archivo (`prisma/dev.db`, la ruta la define `DATABASE_URL`). Se respalda copiando ese archivo mientras la app no esté escribiendo en él. No hay un servidor de BD aparte que instalar ni configurar.
