# Panel de Compras — Next.js + Prisma (SQLite)

Migración de la app original (una sola página HTML) a **Next.js (App Router)** + **React** + **Prisma ORM** sobre **SQLite**, usando **migraciones** (`prisma migrate`) en vez de datos "quemados".

> Los datos en `backend/prisma/seed-data.json` son solo un **ejemplo** para demostrar que la app funciona igual que el original — no son los datos reales del negocio.

## Estructura del repo

El proyecto está dividido en dos apps Next.js independientes, hermanas dentro del mismo repo:

- **`backend/`** — solo rutas API (`app/api/*`), Prisma/SQLite, autenticación. Corre en el puerto **3001**.
- **`frontend/`** — todas las páginas (dashboard, registros, usuarios, auditoría, agente IA, login). Corre en el puerto **3000** y obtiene todos sus datos por HTTP contra el backend (nunca accede a Prisma directamente).

En desarrollo, las llamadas `fetch("/api/...")` hechas desde el navegador se reenvían automáticamente del frontend al backend vía `rewrites()` (`frontend/next.config.js`), así que desde la UI todo se ve same-origin. Las cargas iniciales de datos en Server Components usan `frontend/lib/backendFetch.js`, que llama directo al backend reenviando la cookie de sesión.

Ambas apps comparten la misma `SESSION_SECRET` (debe ser idéntica en `backend/.env` y `frontend/.env`) porque cada una firma/verifica la cookie de sesión con su propia copia de `lib/session.js`.

## Requisitos
- Node.js 18+

## Puesta en marcha

```bash
# Backend
cd backend
npm install
npx prisma generate
npx prisma migrate dev --name init   # crea prisma/migrations/ y la base prisma/dev.db
npm run db:seed                       # carga los registros de ejemplo
npm run dev                           # http://localhost:3001

# Frontend (en otra terminal)
cd frontend
npm install
npm run dev                           # http://localhost:3000
```

Abre `http://localhost:3000` — el backend debe estar corriendo en `http://localhost:3001` (o el valor de `BACKEND_URL` en `frontend/.env`).

## Scripts útiles

**`backend/`**
- `npm run dev` / `npm run build` / `npm start` (puerto 3001)
- `npm run prisma:migrate` → `prisma migrate dev` (nueva migración en desarrollo)
- `npm run prisma:deploy` → `prisma migrate deploy` (aplicar migraciones en producción)
- `npm run prisma:studio` → explorador visual de la base de datos
- `npm run db:seed` → recarga los datos de ejemplo

**`frontend/`**
- `npm run dev` / `npm run build` / `npm start` (puerto 3000)

## Estructura

- `backend/prisma/schema.prisma` — modelos `Record`, `User`, `Meta`, etc., migraciones versionadas en `backend/prisma/migrations/`.
- `backend/lib/prisma.js`, `backend/lib/records.js` — acceso a datos.
- `backend/app/api/*` — endpoints REST que reemplazan la persistencia "republicar HTML" del original, incluyendo `/api/auth/me` y `/api/audit/actors` (agregados para que el frontend pueda obtener sesión y datos por HTTP en vez de tocar Prisma).
- `frontend/lib/businessDays.js`, `frontend/lib/format.js` — reglas de negocio (días hábiles/festivos Colombia, formato de moneda) portadas del original.
- `frontend/lib/backendFetch.js`, `frontend/lib/auth.js` — helpers para llamar al backend desde Server Components reenviando la cookie de sesión.
- `frontend/components/*` — UI en React (pestañas Registros y Dashboard de compras), fiel al diseño y funcionalidad del original.

## Cargar los datos reales

El seed actual es de ejemplo. Para cargar los datos reales de compras, reemplaza `backend/prisma/seed-data.json` por un export real (mismo shape: `{"records":[...], "meta":{...}}`) y vuelve a correr `npm run db:seed` dentro de `backend/`.
