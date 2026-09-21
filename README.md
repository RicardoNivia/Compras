# Panel de Compras — Next.js + Prisma (SQLite)

Migración de la app original (una sola página HTML) a **Next.js (App Router)** + **React** + **Prisma ORM** sobre **SQLite**, usando **migraciones** (`prisma migrate`) en vez de datos "quemados".

> Los datos en `prisma/seed-data.json` son solo un **ejemplo** para demostrar que la app funciona igual que el original — no son los datos reales del negocio.

## Requisitos
- Node.js 18+

## Puesta en marcha

```bash
npm install
npx prisma generate
npx prisma migrate dev --name init   # crea prisma/migrations/ y la base prisma/dev.db
npm run db:seed                       # carga los registros de ejemplo
npm run dev                           # http://localhost:3000
```

## Scripts útiles
- `npm run dev` / `npm run build` / `npm start`
- `npm run prisma:migrate` → `prisma migrate dev` (nueva migración en desarrollo)
- `npm run prisma:deploy` → `prisma migrate deploy` (aplicar migraciones en producción)
- `npm run prisma:studio` → explorador visual de la base de datos
- `npm run db:seed` → recarga los datos de ejemplo

## Estructura
- `prisma/schema.prisma` — modelos `Record` y `Meta`, migraciones versionadas en `prisma/migrations/`.
- `lib/prisma.js`, `lib/records.js` — acceso a datos.
- `lib/businessDays.js`, `lib/format.js` — reglas de negocio (días hábiles/festivos Colombia, formato de moneda) portadas del original.
- `app/api/records/*` — endpoints REST (GET/POST/PUT/PATCH/DELETE) que reemplazan la persistencia "republicar HTML" del original.
- `components/*` — UI en React (pestañas Registros y Dashboard de compras), fiel al diseño y funcionalidad del original.

## Cargar los datos reales
El seed actual es de ejemplo. Para cargar los datos reales de compras, reemplaza `prisma/seed-data.json` por un export real (mismo shape: `{"records":[...], "meta":{...}}`) y vuelve a correr `npm run db:seed`.
