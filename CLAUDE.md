# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Panel de Compras" (Sinco) — a purchasing dashboard, migrated from a single-file HTML app (vendored jsPDF/jspdf-autotable/html2canvas, inline JSON data) into **Next.js (App Router, JavaScript, not TypeScript)** + **React** + **Prisma ORM on SQLite**. The original's "regenerate and republish the whole HTML file" persistence model was replaced with a real REST API + database.

The seed data in `prisma/seed-data.json` is **example data only**, not the real business dataset (~479 records in the original). See "Loading real data" below.

## Commands

```bash
npm install
npx prisma generate
npx prisma migrate dev --name <name>   # create/apply a migration (dev)
npm run db:seed                        # reset + reload prisma/seed-data.json via prisma/seed.mjs
npm run dev                            # http://localhost:3000
npm run build
npm start
npm run lint
npm run prisma:deploy                  # prisma migrate deploy (production)
npm run prisma:studio                  # visual DB browser
```

There is no test suite in this repo currently.

## Architecture

- **Data layer**: `prisma/schema.prisma` defines two models — `Record` (a single purchase record: dates, area, responsable, estado, categoría, proveedor, valores `valorConIva`/`valorSinIva`/`valorCot`, `radicado` boolean, etc., mapped to table `records`) and `Meta` (singleton row `id=1` tracking `sourceFile`/`sourceSheet`/`nextLocalSeq`, mapped to `meta`). Schema changes go through `prisma migrate dev`, never hand-edited SQL.
- **`lib/prisma.js`**: singleton `PrismaClient` via `globalThis`, required to avoid exhausting connections under Next.js dev hot-reload.
- **`lib/records.js`**: all data-access + validation lives here (`listRecords`, `getMeta`, `createRecord`, `updateRecord`, `patchRecord`, `deleteRecord`, `sanitizeInput`, `toClientRecord`). Route handlers are thin wrappers around this module — validation errors are thrown as `Error` with a `.status` property (e.g. 400) that route handlers read directly.
- **API routes** (`app/api/records/route.js`, `app/api/records/[id]/route.js`): REST — `GET`/`POST` on the collection, `PUT`/`PATCH`/`DELETE` on `[id]`. `PATCH` is specifically used for the "radicado" toggle (partial update), `PUT` for a full record replace.
- **`app/page.js`**: async Server Component — fetches initial `records`/`meta` directly via `lib/records.js` (not through the API) and passes them as props into the client component tree. `export const dynamic = "force-dynamic"` — this page is not statically generated.
- **`components/PanelCompras.jsx`**: top-level client component (`"use client"`), owns the two-tab layout (Registros / Dashboard de compras) and shared state; `lib/api.js` is the fetch client it uses for all subsequent CRUD after the initial server-rendered load.
  - `RegistrosView.jsx` — the records table tab (filters, table, pagination, CRUD via `RecordModal.jsx`/`DetailModal.jsx`).
  - `DashboardView.jsx` — the analytics tab (KPIs, charts).
  - `components/charts/*` (`BarChartSvg.jsx`, `StackedBarChartSvg.jsx`, etc.) — charts are hand-rolled SVG React components, not a charting library, to match the original's exact visual behavior.
- **`lib/businessDays.js`**: Colombian business-day/holiday logic ported from the original — fixed holiday list + Meeus/Jones/Butcher Easter algorithm + `nextMonday` shifting for "Emiliani" holidays. Change with care; this must match the original's date math exactly.
- **`lib/format.js`**: currency/number/date formatting helpers (`fmtCOP`, `fmtCompact`, `fmtNum`, `esDecimal`, `fmtPesos`, `fmtDateDisplay`) ported from the original — used throughout the UI for consistent es-CO formatting.
- **`lib/exportHelpers.js`**: client-side exports — CSV (semicolon-delimited, BOM, `;`/quote escaping to match Excel's es-CO CSV dialect), PDF (`jspdf` + `jspdf-autotable`), Word (`docx` npm package — a real `.docx`, replacing the original's hand-rolled ZIP/OOXML writer), and full-dashboard PDF snapshot via `html2canvas` + `jspdf`.
- **`app/globals.css`**: CSS custom properties / design tokens ported 1:1 from the original inline `<style>` block — light mode + `prefers-color-scheme: dark` + explicit `[data-theme]` overrides, plus every component class (`.topbar`, `.tabs`, `.kpi-row`, `.table-card`, `.modal-*`, `.gauge-*`, etc.). New UI should reuse these existing classes/tokens rather than introducing a new styling system.
- **`legacy/panel-original.html`**: an incomplete, unreliable leftover fragment from an early failed transcription attempt — not a real reference copy of the original app. Do not treat its contents as authoritative.

## Loading real data

The seed (`prisma/seed-data.json`, loaded by `prisma/seed.mjs` via `npm run db:seed`) is illustrative sample data only. To load the real dataset, replace `prisma/seed-data.json` with a real export in the same shape (`{"records": [...], "meta": {...}}`) and re-run `npm run db:seed` (this does a full `deleteMany()` + recreate, then upserts `Meta`).
