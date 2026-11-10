# Panel de Compras y Bienestar (Sinco)

Aplicación de Sinco con dos módulos: **Compras** (registros, proveedores, presupuesto, informes) y **Bienestar** (actividades de Bienestar y Fundación: cronograma, participación, inventario, fotos y su costo cruzado con Compras). Migrado desde una app de un solo archivo HTML (jsPDF/jspdf-autotable/html2canvas vendorizados, datos JSON inline) hacia una arquitectura de dos aplicaciones Next.js independientes con una API REST real y base de datos.

## Tecnologías

- **Next.js 14 (App Router)** — JavaScript (no TypeScript), tanto en `backend/` como en `frontend/`.
- **React 18**.
- **Prisma ORM** sobre **PostgreSQL**.
- **bcryptjs** — hash de contraseñas.
- **Web Crypto (HMAC)** — firma de la cookie de sesión (no usa el módulo `crypto` de Node, para poder correr también en el runtime Edge del middleware).
- **Anthropic (Claude) API** — único proveedor de IA (Agente IA "Nova", informes automáticos, extracción de facturas, moderación). No hay fallback a otro proveedor.
- **nodemailer** — envío de correo (informes automáticos programados).
- **pdfkit** (backend) y **jspdf** + **jspdf-autotable** + **docx** + **html2canvas-pro** (frontend) — generación de PDF/Word y snapshot del dashboard.
- **xlsx**, **pdfjs-dist** — lectura de archivos en el frontend (importación/lectura de adjuntos).
- **swagger-jsdoc** + **swagger-ui-react** — documentación OpenAPI de la API (`/docs`, `/api/openapi.json`), solo accesible para `admin`.
- Gráficos: SVG hecho a mano (sin librería de charting), para igualar el comportamiento visual exacto de la app original.
- No hay suite de tests en este repo actualmente.

## Arquitectura

**[📐 Ver diagrama de arquitectura completo →](docs/architecture.html)** (interactivo, con flujos de datos, modelos, rutas API)

Dos aplicaciones Next.js independientes, carpetas hermanas en la raíz del repo:

- **`backend/`** — API-only: rutas `app/api/*`, Prisma/PostgreSQL, autenticación. Puerto **3001**.
- **`frontend/`** — la UI: todas las rutas de página (dashboard, registros, usuarios, auditoría, maestros, presupuesto, alertas, informes, agente IA, login). Puerto **3000**. Nunca toca Prisma directamente — toda lectura/escritura de datos va por HTTP al backend.

El frontend llama al backend de dos formas:
- Desde el navegador (`fetch("/api/...")`), como rutas relativas — `frontend/next.config.js` las reescribe hacia `BACKEND_URL`, así que desde el navegador todo es same-origin (sin CORS, la cookie funciona directo).
- Desde Server Components (`frontend/app/**/page.js`), vía `frontend/lib/backendFetch.js`, que reenvía manualmente la cookie de sesión de la petición entrante.

Ambas apps necesitan el **mismo** `SESSION_SECRET` (cada una firma/verifica la cookie de forma independiente con su propia copia de `lib/session.js`).

### Roles y permisos

Cuatro roles: `admin` (acceso total), `registro` (dashboard + CRUD de registros, sin administración de usuarios), `legalizar` (solo tabla de registros, puede editar pero no crear/eliminar), `radicar` (solo tabla de registros, solo puede marcar "radicado").

El comportamiento por defecto de cada rol vive en `lib/roles.js` (duplicado en ambas apps). Por encima de eso, la **Matriz de permisos** (`backend/lib/permissions.js`, UI en Usuarios → admin) permite activar/desactivar en tiempo real ~12 funcionalidades por rol (dashboard, alertas, agente IA, crear/editar/eliminar registro, radicar, maestros, presupuesto, usuarios, auditoría, informes), sin tocar código. `admin` siempre tiene todo, no se puede restringir desde la matriz.

### Funcionalidades principales

- **Registros** — tabla de compras con filtros, CRUD, exportación a CSV/PDF/Word.
- **Dashboard** — KPIs y gráficos de analítica.
- **Maestros** — catálogos administrables que alimentan los `<select>` del formulario de registros (área, responsable, estado, categoría, medio de pago, estado de legalización).
- **Presupuesto** — presupuesto anual por área (o por categoría dentro de cada área), usado para calcular riesgo de sobregasto.
- **Alertas** — solicitudes pendientes, riesgo de presupuesto, riesgo de tiempos (SLA de 8 días hábiles), compras legalizadas sin radicar.
- **Informes automáticos** — reportes ejecutivos configurables (bloques de texto/KPI/gráfico/tabla/IA), con envío programado por correo (PDF adjunto + cuerpo HTML editable).
- **Usuarios** — administración de usuarios y la Matriz de permisos (solo con el permiso `viewUsuarios`).
- **Auditoría** — bitácora de cambios sobre registros, usuarios, maestros, presupuesto, permisos e informes.
- **Agente IA (Nova)** — chat con herramientas sobre compras/presupuesto/auditoría, lector de facturas (visión, no OCR+reglas), explicación de cifras, revisión de alertas/observaciones.

Ver `CLAUDE.md` para el detalle de arquitectura por módulo (rutas, archivos `lib/*`, modelos Prisma, componentes de frontend).

## Comandos

```bash
# backend/
npm install
npx prisma generate
npx prisma migrate dev --name <nombre>   # crear/aplicar una migración (dev)
npm run db:seed                          # resetea + recarga prisma/seed-data.json
npm run dev                              # http://localhost:3001
npm run build
npm start
npm run lint
npm run prisma:deploy                    # prisma migrate deploy (producción)
npm run prisma:studio                    # explorador visual de la BD

# frontend/ (instalación y proceso separados — correr junto al backend)
npm install
npm run dev                              # http://localhost:3000
npm run build
npm start
npm run lint
```

## Variables de entorno

**`backend/.env`**
| Variable | Descripción |
|---|---|
| `DATABASE_URL` | Cadena de conexión PostgreSQL (requerida por Prisma). |
| `SESSION_SECRET` | Secreto HMAC para firmar la cookie de sesión. Debe ser el mismo valor que en `frontend/.env`. |
| `ANTHROPIC_API_KEY` | API key de Anthropic (Agente IA, informes, moderación). |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM_NAME` | Envío de correo de los informes automáticos. |

**`frontend/.env`**
| Variable | Descripción |
|---|---|
| `SESSION_SECRET` | Mismo valor que en `backend/.env`. |
| `BACKEND_URL` | URL del backend (por defecto `http://localhost:3001`), usada por el proxy de `rewrites()` y por `backendFetch.js`. |

## Datos de ejemplo

El seed (`backend/prisma/seed-data.json`, cargado con `npm run db:seed`) es solo un ejemplo ilustrativo, no el dataset real de negocio. Para cargar datos reales, reemplaza ese archivo por un export real con la misma forma (`{"records": [...], "meta": {...}}`) y vuelve a correr `npm run db:seed` desde `backend/` (esto borra y recrea todo).

Hay usuarios admin sembrados por defecto (ver `backend/prisma/seed.mjs`) con contraseña `12345678` — **rotar/cambiar antes de cualquier despliegue real**.

## Más documentación

- `CLAUDE.md` — guía detallada de arquitectura para trabajar en el código (módulo por módulo, convenciones, archivos duplicados entre apps).
