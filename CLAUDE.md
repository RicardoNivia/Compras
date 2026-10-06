# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Panel de Compras" (Sinco) — a purchasing dashboard, migrated from a single-file HTML app (vendored jsPDF/jspdf-autotable/html2canvas, inline JSON data) into **Next.js (App Router, JavaScript, not TypeScript)** + **React** + **Prisma ORM on SQLite**. The original's "regenerate and republish the whole HTML file" persistence model was replaced with a real REST API + database.

The repo is split into two independent Next.js apps, sibling folders at the repo root:

- **`backend/`** — API-only Next.js app: `app/api/*` routes, Prisma/SQLite, auth. Runs on port **3001**.
- **`frontend/`** — the UI: all page routes (dashboard, registros, usuarios, auditoría, agente IA, login). Runs on port **3000**. Never touches Prisma directly — every data read/write goes through HTTP calls to the backend.

The seed data in `backend/prisma/seed-data.json` is **example data only**, not the real business dataset (~479 records in the original). See "Loading real data" below.

## Commands

```bash
# backend/
npm install
npx prisma generate
npx prisma migrate dev --name <name>   # create/apply a migration (dev)
npm run db:seed                        # reset + reload prisma/seed-data.json via prisma/seed.mjs
npm run dev                            # http://localhost:3001
npm run build
npm start
npm run lint
npm run prisma:deploy                  # prisma migrate deploy (production)
npm run prisma:studio                  # visual DB browser

# frontend/ (separate install, separate process — run alongside backend)
npm install
npm run dev                            # http://localhost:3000
npm run build
npm start
npm run lint
```

There is no test suite in this repo currently.

## Architecture

### Cross-app communication (frontend ↔ backend)

- Browser-side `fetch("/api/...")` calls (client components, `frontend/lib/api.js`) stay as relative paths — `frontend/next.config.js` has a `rewrites()` block that proxies `/api/:path*` to `BACKEND_URL` (env var, defaults to `http://localhost:3001`), so from the browser's perspective everything is same-origin (no CORS, cookie just works).
- Server Component data loads (`frontend/app/**/page.js`) call the backend directly via `frontend/lib/backendFetch.js`, which forwards the incoming request's session cookie manually (a server-to-server `fetch` does not do this on its own, rewrites don't apply to it either).
- `frontend/lib/auth.js#getSessionUser()` replaces the old direct-Prisma version — it calls `GET /api/auth/me` on the backend instead.
- Both apps need the **same** `SESSION_SECRET` in their `.env` (each signs/verifies the session cookie independently with its own copy of `lib/session.js`).

### Backend (`backend/`)

- **Data layer**: `prisma/schema.prisma` defines `Record` (a single purchase record: dates, area, responsable, estado, categoría, proveedor, valores `valorConIva`/`valorSinIva`/`valorCot`, `radicado` boolean, etc., mapped to table `records`), `Meta` (singleton row `id=1` tracking `sourceFile`/`sourceSheet`/`nextLocalSeq`, mapped to `meta`), and `User` (`nombre`, `email` unique, `password` — a bcrypt hash, `role`, `activo`, mapped to table `users`), plus `AuditLog` and agent-chat `Conversation`/`Message` models. Schema changes go through `prisma migrate dev`, never hand-edited SQL.
- **`lib/prisma.js`**: singleton `PrismaClient` via `globalThis`, required to avoid exhausting connections under Next.js dev hot-reload.
- **`lib/records.js`**: all record data-access + validation (`listRecords`, `getMeta`, `createRecord`, `updateRecord`, `patchRecord`, `deleteRecord`, `sanitizeInput`, `toClientRecord`). `lib/users.js` is the equivalent for `User` (`listUsers`, `createUser`, `updateUser`, `deleteUser` — hashes passwords with `bcryptjs` before writing, never stores plaintext). Route handlers are thin wrappers around these modules — validation errors are thrown as `Error` with a `.status` property (e.g. 400) that route handlers read directly.
- **Auth**: `lib/session.js` signs/verifies a small HMAC (Web Crypto, not Node `crypto`) session token so it works in both the Node route-handler runtime and the Edge `middleware.js` runtime; the token is stored in an httpOnly `session` cookie. `lib/auth-server.js#getSessionUser()` reads that cookie and re-fetches the user from the DB, exposed to the frontend via `GET /api/auth/me`. `middleware.js` gates every `/api/*` route except `/api/auth/login`: unauthenticated requests get a 401, non-admins get a 403 on `/api/users`, `/api/agent`, `/api/audit`. `lib/roles.js` defines the four roles and the `canX(role)` permission helpers — **the source of truth for what each role can do**; both the frontend UI (a duplicated copy of this file, hides buttons) and these route handlers (403s) call into it, so a permission change belongs in both copies (`backend/lib/roles.js` and `frontend/lib/roles.js` must stay in sync).
  - **Roles**: `admin` (full access), `registro` (dashboard + full record CRUD, no user admin), `legalizar` (records table only, can edit but not create/delete), `radicar` (records table only, can only toggle the "radicado" check).
  - Default seeded admins (see `prisma/seed.mjs`): `ricardo.nivia@sinco.com.co` / `carolina.daza@sinco.com.co`, password `12345678` (bcrypt-hashed before insert) — change/rotate before any real deployment.
- `app/api/records/*`, `app/api/users/*`, `app/api/audit/*`, `app/api/agent/*` — REST endpoints, thin wrappers around `lib/*`. `app/api/auth/me/route.js` and `app/api/audit/actors/route.js` exist specifically so the frontend can get session-user info and audit actors over HTTP instead of importing Prisma-backed libs directly.

### Frontend (`frontend/`)

- **Routing**: real Next.js routes per section (not client-side tabs) — `app/page.js` redirects to `/dashboard` or `/registros` depending on role; `app/dashboard/page.js`, `app/registros/page.js`, `app/usuarios/page.js`, `app/auditoria/page.js` are async Server Components that call `getSessionUser()` (from `lib/auth.js`, HTTP to the backend) + the relevant `canView*` guard, fetch data via `lib/backendFetch.js` (HTTP to the backend, not a direct DB call), and render `components/AppShell.jsx` (sidebar + topbar shell) wrapping the page's client view. All are `export const dynamic = "force-dynamic"`.
- **`components/Sidebar.jsx`**: client component; nav items are filtered by `lib/roles.js` permissions and rendered as `next/link`s (active state via `usePathname()`), expands on hover and collapses on outside click, and owns the logout button (`POST /api/auth/logout` then redirect to `/login`).
  - `RegistrosPageClient.jsx` → `RegistrosView.jsx` — the records table (filters, table, pagination, CRUD via `RecordModal.jsx`/`DetailModal.jsx`); both take a `currentUser` prop and gate the add/edit/delete/radicado-toggle UI through the same `lib/roles.js` helpers used server-side. Mutations go through `lib/api.js` (`fetch("/api/records...")`, proxied to the backend by `next.config.js` rewrites).
  - `DashboardView.jsx` — the analytics view (KPIs, charts), only reachable by roles where `canViewDashboard` is true.
  - `UsuariosView.jsx` / `UserModal.jsx` — user administration (admin-only), calling `/api/users` (proxied to the backend).
  - `components/charts/*` (`BarChartSvg.jsx`, `StackedBarChartSvg.jsx`, etc.) — charts are hand-rolled SVG React components, not a charting library, to match the original's exact visual behavior.
  - `ExportMenu.jsx` — CSV/PDF/Word export dropdown, rendered inside the Registros page.
- **`lib/businessDays.js`**: Colombian business-day/holiday logic ported from the original — fixed holiday list + Meeus/Jones/Butcher Easter algorithm + `nextMonday` shifting for "Emiliani" holidays. Change with care; this must match the original's date math exactly.
- **`lib/format.js`**: currency/number/date formatting helpers (`fmtCOP`, `fmtCompact`, `fmtNum`, `esDecimal`, `fmtPesos`, `fmtDateDisplay`) ported from the original — used throughout the UI for consistent es-CO formatting.
- **`lib/exportHelpers.js`**: low-level export helpers (`saveBlob`, `todayISO`) used by `ExportMenu.jsx`, which builds CSV (semicolon-delimited, BOM, `;`/quote escaping to match Excel's es-CO CSV dialect), PDF (`jspdf` + `jspdf-autotable`), and Word (`docx` npm package — a real `.docx`) exports, plus a full-dashboard PDF snapshot via `html2canvas` + `jspdf` in `DashboardView.jsx`.
- **`app/globals.css`**: CSS custom properties / design tokens matching Sinco's brand palette (Nunito headings / Roboto body, primary `#2063a0`) — light mode + `prefers-color-scheme: dark` + explicit `[data-theme]` overrides, plus every component class (`.topbar`, `.sidebar-*`, `.kpi-row`, `.table-card`, `.modal-*`, `.gauge-*`, `.login-*`, `.spinner`, etc.). New UI should reuse these existing classes/tokens rather than introducing a new styling system.

### Files duplicated across both apps

`lib/session.js`, `lib/roles.js`, and `lib/auditLabels.js` have no Prisma/Node-only dependency, so each app keeps its own copy (`backend/lib/*` and `frontend/lib/*`) rather than sharing a package. **When editing any of these, update both copies.**

Anthropic (Claude) is the only AI provider configured in the app — there is no Gemini fallback. `backend/lib/anthropic.js` wraps the Messages API (`ANTHROPIC_API_KEY` env var), `backend/lib/anthropicModels.js` is the model catalog (`DEFAULT_ANTHROPIC_MODEL`), `backend/lib/aiChatCascade.js` is the streaming entry point used by the Agente IA chat, and `backend/lib/aiStructured.js` is the non-streaming structured-JSON entry point used by Informes automáticos, moderation, "Explícame este número", etc. All roles use the same model — there is no paid/free distinction or per-role AI model gating.

- **`legacy/panel-original.html`** (repo root): an incomplete, unreliable leftover fragment from an early failed transcription attempt — not a real reference copy of the original app. Do not treat its contents as authoritative.

## Loading real data

The seed (`backend/prisma/seed-data.json`, loaded by `backend/prisma/seed.mjs` via `npm run db:seed`) is illustrative sample data only. To load the real dataset, replace `backend/prisma/seed-data.json` with a real export in the same shape (`{"records": [...], "meta": {...}}`) and re-run `npm run db:seed` from `backend/` (this does a full `deleteMany()` + recreate, then upserts `Meta`).
