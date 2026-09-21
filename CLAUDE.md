# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install       # installs deps; postinstall runs `prisma generate`
npm run dev        # start Next.js dev server (http://localhost:3000)
npm run build      # production build
npm start          # run the production build

npm run db:migrate # create/apply a Prisma migration in dev (prompts for a migration name)
npm run db:deploy  # apply existing migrations, non-interactive (use in production)
npm run db:seed    # load prisma/seed-records.json via prisma/seed.js (upsert, safe to re-run)
npm run db:studio  # Prisma Studio GUI for the database
```

There is no test suite or linter beyond `next lint`. `npm run lint` runs the default Next.js ESLint config.

## Architecture

This is a Next.js (App Router) rewrite of a legacy static HTML panel (`Panel_de_Compras_-_Sinco.html`). The rewrite intentionally keeps almost all of the original front-end logic untouched and only swaps its data source from an embedded `<script id="app-data">` JSON blob to a real database queried through Prisma. Understanding that split is key to working in this repo:

- **`prisma/schema.prisma`** — single model, `PurchaseRecord` (mapped to table `purchase_records`), backed by **SQLite** (file `prisma/dev.db`, path set via `DATABASE_URL` in `.env`). All fields besides `id`/`createdAt`/`updatedAt` are nullable strings, dates, or floats — validation happens in application code, not the schema.
- **`lib/prisma.js`** — singleton `PrismaClient`, cached on `globalThis` to survive dev-mode hot reloads.
- **`lib/records.js`** — the only translation layer between Prisma rows and the JSON shape the legacy front-end expects: `toClientRecord` (DB → client, dates become `"YYYY-MM-DD"` strings) and `fromClientPayload` (client → DB, does the one piece of real validation: `descripcion` is required). Any new column must be added in three places: `schema.prisma`, `lib/records.js` (both functions), and the front-end (see below).
- **`app/api/records/route.js`** (GET list / POST create) and **`app/api/records/[id]/route.js`** (PUT update / DELETE) — thin REST wrappers around Prisma + `lib/records.js`. Both routes are `export const dynamic = "force-dynamic"` since they must never be statically cached.
- **`app/page.js`** — Server Component; queries all records at request time (ordered by `fechaSolicitud`, `createdAt`) and passes them as `initialRecords` to the client. On DB error it logs and falls back to an empty list rather than crashing the page.
- **`app/PanelCompras.jsx`** — client component that bridges Server Component data into the legacy vanilla-JS app: it sets `window.__INITIAL_STATE__ = { records, meta }` (replacing the old embedded `<script id="app-data">`), then sequentially loads the vendor scripts in `public/vendor/` (jsPDF → jsPDF autoTable → html2canvas → `app-logic.js`, order matters because `app-logic.js` expects `window.jspdf`/`window.html2canvas` to already exist), then reveals the injected HTML shell.
- **`app/panelShellHtml.js`** — the original panel's HTML (topbar, dashboard, filters, table, modals) as a plain string, injected via `dangerouslySetInnerHTML`. No data is embedded in it anymore.
- **`public/vendor/app-logic.js`** (~2000 lines) — the legacy application logic (filtering, sorting, charts, CSV/PDF/Word export, the add/edit modal). It reads `window.__INITIAL_STATE__` on load (falling back to the old `#app-data` script tag if present) and talks to the backend via `fetch` calls to `/api/records` (create), `/api/records/:id` (update/delete) instead of just mutating in-memory state. When editing UI behavior, this is almost always the file to change — it is loaded as a plain `<script>` tag, not a bundled ES module, so it uses `var`/global functions rather than imports.
- **`prisma/seed.js`** + **`prisma/seed-records.json`** — one-time loader for the 479 original panel records, upserted by their original ids (`c1`, `c2`, ...) so the seed is idempotent.

### Adding a new field end-to-end

1. Add the column to `prisma/schema.prisma`, run `npm run db:migrate`.
2. Map it in both directions in `lib/records.js`.
3. Add the form field/column in `app/panelShellHtml.js` and the corresponding read/write logic in `public/vendor/app-logic.js`.

### Database notes

SQLite lives entirely in one file (`prisma/dev.db`, path from `DATABASE_URL`). Back it up by copying that file while the app isn't writing to it. There is no separate DB server to install or configure.
