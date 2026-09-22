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

- **Data layer**: `prisma/schema.prisma` defines `Record` (a single purchase record: dates, area, responsable, estado, categoría, proveedor, valores `valorConIva`/`valorSinIva`/`valorCot`, `radicado` boolean, etc., mapped to table `records`), `Meta` (singleton row `id=1` tracking `sourceFile`/`sourceSheet`/`nextLocalSeq`, mapped to `meta`), and `User` (`nombre`, `email` unique, `password` — a bcrypt hash, `role`, `activo`, mapped to table `users`). Schema changes go through `prisma migrate dev`, never hand-edited SQL.
- **`lib/prisma.js`**: singleton `PrismaClient` via `globalThis`, required to avoid exhausting connections under Next.js dev hot-reload.
- **`lib/records.js`**: all record data-access + validation (`listRecords`, `getMeta`, `createRecord`, `updateRecord`, `patchRecord`, `deleteRecord`, `sanitizeInput`, `toClientRecord`). `lib/users.js` is the equivalent for `User` (`listUsers`, `createUser`, `updateUser`, `deleteUser` — hashes passwords with `bcryptjs` before writing, never stores plaintext). Route handlers are thin wrappers around these modules — validation errors are thrown as `Error` with a `.status` property (e.g. 400) that route handlers read directly.
- **Auth**: `lib/session.js` signs/verifies a small HMAC (Web Crypto, not Node `crypto`) session token so it works in both the Node route-handler runtime and the Edge `middleware.js` runtime; the token is stored in an httpOnly `session` cookie. `lib/auth-server.js#getSessionUser()` reads that cookie and re-fetches the user from the DB (Server Components / route handlers only, not Edge). `middleware.js` gates every route except `/login` and `/api/auth/login`: unauthenticated requests redirect to `/login` (or get a 401 for `/api/*`), and non-admins are redirected away from `/usuarios` and `/api/users/*` (403 for the API). `lib/roles.js` defines the four roles and the `canX(role)` permission helpers — **the source of truth for what each role can do**; both the UI (hides buttons) and the `app/api/records/*` route handlers (403s) call into it, so a permission change belongs there, not scattered across components.
  - **Roles**: `admin` (full access), `registro` (dashboard + full record CRUD, no user admin), `legalizar` (records table only, can edit but not create/delete), `radicar` (records table only, can only toggle the "radicado" check).
  - Default seeded admins (see `prisma/seed.mjs`): `ricardo.nivia@sinco.com.co` / `carolina.daza@sinco.com.co`, password `12345678` (bcrypt-hashed before insert) — change/rotate before any real deployment.
- **Routing**: real Next.js routes per section (not client-side tabs) — `app/page.js` redirects to `/dashboard` or `/registros` depending on role; `app/dashboard/page.js`, `app/registros/page.js`, `app/usuarios/page.js` are async Server Components that call `getSessionUser()` + the relevant `canView*` guard, fetch data directly via `lib/records.js`/`lib/users.js` (not through the API), and render `components/AppShell.jsx` (sidebar + topbar shell) wrapping the page's client view. All are `export const dynamic = "force-dynamic"`.
- **`components/Sidebar.jsx`**: client component; nav items are filtered by `lib/roles.js` permissions and rendered as `next/link`s (active state via `usePathname()`), expands on hover and collapses on outside click, and owns the logout button (`POST /api/auth/logout` then redirect to `/login`).
  - `RegistrosPageClient.jsx` → `RegistrosView.jsx` — the records table (filters, table, pagination, CRUD via `RecordModal.jsx`/`DetailModal.jsx`); both take a `currentUser` prop and gate the add/edit/delete/radicado-toggle UI through the same `lib/roles.js` helpers used server-side.
  - `DashboardView.jsx` — the analytics view (KPIs, charts), only reachable by roles where `canViewDashboard` is true.
  - `UsuariosView.jsx` / `UserModal.jsx` — user administration (admin-only), backed by `app/api/users/route.js` + `app/api/users/[id]/route.js`.
  - `components/charts/*` (`BarChartSvg.jsx`, `StackedBarChartSvg.jsx`, etc.) — charts are hand-rolled SVG React components, not a charting library, to match the original's exact visual behavior.
  - `ExportMenu.jsx` — CSV/PDF/Word export dropdown, rendered inside the Registros page.
- **`lib/businessDays.js`**: Colombian business-day/holiday logic ported from the original — fixed holiday list + Meeus/Jones/Butcher Easter algorithm + `nextMonday` shifting for "Emiliani" holidays. Change with care; this must match the original's date math exactly.
- **`lib/format.js`**: currency/number/date formatting helpers (`fmtCOP`, `fmtCompact`, `fmtNum`, `esDecimal`, `fmtPesos`, `fmtDateDisplay`) ported from the original — used throughout the UI for consistent es-CO formatting.
- **`lib/exportHelpers.js`**: low-level export helpers (`saveBlob`, `todayISO`) used by `ExportMenu.jsx`, which builds CSV (semicolon-delimited, BOM, `;`/quote escaping to match Excel's es-CO CSV dialect), PDF (`jspdf` + `jspdf-autotable`), and Word (`docx` npm package — a real `.docx`) exports, plus a full-dashboard PDF snapshot via `html2canvas` + `jspdf` in `DashboardView.jsx`.
- **`app/globals.css`**: CSS custom properties / design tokens matching Sinco's brand palette (Nunito headings / Roboto body, primary `#2063a0`) — light mode + `prefers-color-scheme: dark` + explicit `[data-theme]` overrides, plus every component class (`.topbar`, `.sidebar-*`, `.kpi-row`, `.table-card`, `.modal-*`, `.gauge-*`, `.login-*`, `.spinner`, etc.). New UI should reuse these existing classes/tokens rather than introducing a new styling system.
- **`legacy/panel-original.html`**: an incomplete, unreliable leftover fragment from an early failed transcription attempt — not a real reference copy of the original app. Do not treat its contents as authoritative.

## Loading real data

The seed (`prisma/seed-data.json`, loaded by `prisma/seed.mjs` via `npm run db:seed`) is illustrative sample data only. To load the real dataset, replace `prisma/seed-data.json` with a real export in the same shape (`{"records": [...], "meta": {...}}`) and re-run `npm run db:seed` (this does a full `deleteMany()` + recreate, then upserts `Meta`).
