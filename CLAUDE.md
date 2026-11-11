# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Panel de Compras y Bienestar" (Sinco) — a purchasing and employee-wellbeing app with two modules, Compras and Bienestar (Bienestar and Fundación activities). Internal ids such as the `panel-compras` MCP server name keep the old name on purpose: changing them would break existing connections. Migrated from a single-file HTML app (vendored jsPDF/jspdf-autotable/html2canvas, inline JSON data) into **Next.js (App Router, JavaScript, not TypeScript)** + **React** + **Prisma ORM on PostgreSQL**. The original's "regenerate and republish the whole HTML file" persistence model was replaced with a real REST API + database.

The repo is split into two independent Next.js apps, sibling folders at the repo root:

- **`backend/`** — API-only Next.js app: `app/api/*` routes, Prisma/PostgreSQL, auth. Runs on port **3001**.
- **`frontend/`** — the UI: all page routes (dashboard, registros, usuarios, auditoría, agente IA, login). Runs on port **3000**. Never touches Prisma directly — every data read/write goes through HTTP calls to the backend.

The seed data in `backend/prisma/seed-data.json` is **example data only**, not the real business dataset (~479 records in the original). See "Loading real data" below.

## Conventions

- **Every feature that creates, edits, deletes, or otherwise manages state must be audited.** Any new mutating endpoint/lib (not just `records`/`maestros`/`users`/`proveedores`/`presupuestos`/`permissions`/`reports`, which already do this) needs a corresponding `logXCreate`/`logXUpdate`/`logXDelete` (or equivalent) call in `backend/lib/audit.js`, a field-label map in `backend/lib/auditLabels.js` (+ its `frontend/lib/auditLabels.js` copy) for the diff, and an `entityType` entry in `ENTITY_LABELS` — following the exact pattern already used for `record`/`maestro`/`proveedor`/`user`/`presupuesto`/`permiso`/`informe`/`calificacion`. Audit calls are fire-and-forget (`.catch(() => {})`) so a logging failure never blocks the actual write. Do this as part of building the feature, not as an afterthought.

- **Every table (DB model) records when and by whom a row was created.** New models need `createdAt DateTime @default(now())` plus the creator as `creadoPorUserId String?` and a name snapshot `creadoPorNombre String?` (no FK, same as the other references to `User`; use "Importación Excel" / "Migración histórica" when no person created it). Set both on create from the session user, show them where the row is detailed, and keep them in the audit entry. When adding a column to an existing table, backfill old rows in the same migration. Existing tables that predate this rule and lack the creator columns: bring them in line when you next touch them.
- **Text is always UTF-8; a damaged character (U+FFFD, the replacement-character diamond that replaces an accent or the ñ when the encoding is wrong, e.g. a name saved as Andrea P-diamond-rez) can never be saved.** The database enforces it for every table with the trigger `trg_texto_sin_danos` (migration `texto_sin_caracteres_danados`): a write that adds a U+FFFD to a row is rejected (`check_violation`), whether it comes from the app, a script or an import. `backend/middleware.js` also rejects JSON bodies carrying it with a clear 400, and `apiError` turns a trigger rejection into a 400 (never a raw 500). **Every new table must be protected in its own migration with `SELECT proteger_texto_tabla('<table>');`** — `npm run db:verificar-texto` (backend/) lists unprotected tables and any damaged data (exit code 1), run it before deploying. Never type accents through a Windows console/`curl`/PowerShell without UTF-8 (that is how bad bytes were born): test non-ASCII text with Node `fetch` or the UI, and make import scripts read files as UTF-8 (`iconv-lite` for legacy Latin-1/CP1252 files) instead of letting them guess. Never put a literal U+FFFD in source files.

- **Money uses ISO 4217.** New code stores the currency code next to every amount (`moneda`, validated with `Intl.supportedValuesOf("currency")`, default `COP`), never adds different currencies together, and shows amounts with the code: "COP 1.234.567" (`frontend/lib/moneda.js#fmtMoneda`, `backend/lib/tesoreria/comun.js#fmtMoneda`). Tesorería follows it everywhere; Compras and Bienestar still show "$" with `fmtCOP` (change them only when asked).

- **Every money field is typed with thousands separators (dots, es-CO: 1.234.567), never as a plain number.** Use `frontend/components/MoneyInput.jsx` for any input of a value, price, cost, budget, balance, salary or amount filter — never `<input type="number">` for money. It keeps the plain number in state ("1234567", or "1250.5" with `decimales`) and shows it formatted while typing; `prefix` is the ISO 4217 code in new code (`"COP"`, the account's currency in Tesorería) or `"$"` in the older Compras/Bienestar forms, `null` inside table cells; `decimales` for currencies with cents (typed with a comma); `permitirNegativo` for balances. Non-money numbers (years, percentages, counts) stay as normal numeric inputs.

- **Every table must be paginated.** Any new or modified table that lists rows (records, proveedores, usuarios, auditoría, informes, etc.) needs client- or server-side pagination, in the same format as the Registros table (`RegistrosView.jsx`): a `table-footer` with a `Tamaño` selector (`PAGE_SIZES`, default 25 / 50 / 100; a table inside a modal, and the purchase lists of the activity form, start at 10: 10 / 25 / 50 / 100), `page-btns` with Anterior / Siguiente, a `count-note` with "Página X de Y" and a total count. Reset to page 1 whenever a filter, search or tab changes, and clamp the current page when the result set shrinks. Long text cells (names, descriptions) must truncate with the `desc-tooltip-wrap` / `desc-text` / `desc-tooltip-bubble` hover pattern instead of wrapping, and rows stay single-line and compact. Short summary lists capped at a few rows (e.g. top-5) may skip pagination only if they link to the full paginated table.

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

- **Data layer**: `prisma/schema.prisma` defines `Record` (a single purchase record: dates, area, responsable, estado, categoría, proveedor, valores `valorConIva`/`valorSinIva`/`valorCot`, `radicado` boolean, etc., mapped to table `records`), `Meta` (singleton row `id=1` tracking `sourceFile`/`sourceSheet`/`nextLocalSeq`, mapped to `meta`), and `User` (`nombre`, `email` unique, `password` — a bcrypt hash, `role`, `activo`, mapped to table `users`), plus `AuditLog`, agent-chat `Conversation`/`Message`, `Maestro`, `PresupuestoAnio`/`Presupuesto`/`PresupuestoCategoria`, `RolePermission`, and `ReportConfig` (see below for each). Schema changes go through `prisma migrate dev`, never hand-edited SQL. **New tables going forward use an auto-incrementing integer `id` (`Int @id @default(autoincrement())`), not a cuid** — existing models keep their cuid `id` as-is, this only applies to models created from now on.
- **`lib/prisma.js`**: singleton `PrismaClient` via `globalThis`, required to avoid exhausting connections under Next.js dev hot-reload.
- **`lib/records.js`**: all record data-access + validation (`listRecords`, `getMeta`, `createRecord`, `updateRecord`, `patchRecord`, `deleteRecord`, `sanitizeInput`, `toClientRecord`). `lib/users.js` is the equivalent for `User` (`listUsers`, `createUser`, `updateUser`, `deleteUser` — hashes passwords with `bcryptjs` before writing, never stores plaintext). Route handlers are thin wrappers around these modules — validation errors are thrown as `Error` with a `.status` property (e.g. 400) that route handlers read directly. `lib/apiGuard.js#requirePermission(feature)` centralizes the "get session user + check permission, else 403" boilerplate shared by nearly every route handler (returns `{ user, denied }` — return `denied` if non-null); `apiError(err)` centralizes the `{ error: err.message }, { status: err.status || 500 }` catch-block response.
- **Auth**: `lib/session.js` signs/verifies a small HMAC (Web Crypto, not Node `crypto`) session token so it works in both the Node route-handler runtime and the Edge `middleware.js` runtime; the token is stored in an httpOnly `session` cookie. `lib/auth-server.js#getSessionUser()` reads that cookie and re-fetches the user from the DB, exposed to the frontend via `GET /api/auth/me` (which also returns the caller's effective `permissions` map, see Matriz de permisos below). `middleware.js` gates every `/api/*` route except `/api/auth/login`: unauthenticated requests get a 401, non-admins get a 403 on `/api/users`, `/api/agent`, `/api/audit`. `lib/roles.js` defines the four roles and the `canX(role)` permission helpers — the **static default** for what each role can do; both the frontend UI (a duplicated copy of this file, hides buttons) and route handlers read it as a fallback, so a permission change still belongs in both copies (`backend/lib/roles.js` and `frontend/lib/roles.js` must stay in sync). The actual **runtime source of truth is the Matriz de permisos** (`lib/permissions.js`, see below), which can override these defaults per role.
  - **Roles**: `admin` (full access, cannot be restricted via the permissions matrix), `registro` (dashboard + full record CRUD by default, no user admin), `legalizar` (records table only, can edit but not create/delete by default), `radicar` (records table only, can only toggle the "radicado" check by default) — but any non-admin role's access to a given feature can be overridden at runtime by an admin via the Matriz de permisos.
  - Default seeded admins (see `prisma/seed.mjs`): `ricardo.nivia@sinco.com.co` / `carolina.daza@sinco.com.co`, password `12345678` (bcrypt-hashed before insert) — change/rotate before any real deployment.
- **Roles personalizados y Matriz de permisos**: besides the system roles, admins create custom roles (no default permissions); the runtime source of truth for what a role can do is the Matriz (`lib/permissions.js`, `isRoleAllowed`), with `lib/roles.js` only as fallback. Anything that validates or labels a role uses `rolesCatalogo.js`. Details in `docs/claude/permisos.md`.
- **Referential integrity convention**: every `Record` field backed by a catalog is referenced by **id**, never by text — `Record.<campo>Id` (`areaId`, `estadoId`, `categoriaId`, `medioPagoId`, `estadoLegalizacionId` → `Maestro.id`; `responsableUserId` → `User.id`; `proveedorNit` → `Proveedor.nit`, a real FK with ON UPDATE CASCADE / ON DELETE RESTRICT). The plain-text column (`area`, `estado`, `proveedor`, etc.) is kept only as a snapshot for export/history; `lib/records.js#hydrateConDatosActuales()` resolves the live value from the catalog by id on every read (`listRecords`/create/update) and overrides the snapshot with it — so renaming a value in Maestros/Usuarios/Proveedores is instantly reflected on every existing record without touching them. Writes always validate the id against the catalog (`requireMaestroCampo`/`requireProveedorDelCatalogo`/`requireResponsableDelCatalogo`) and recompute the snapshot text server-side — the client's text is never trusted. Audit "before" snapshots intentionally skip hydration, so the log preserves the value as it was at that point in time. **Apply this same pattern to any new catalog-backed field.**
- **Claude MCP is admin-only** (`lib/mcpGate.js#mcpPermitidoA(role)`): it is NOT a Matriz permission and can never be granted to another role. Details in `docs/claude/informes-mcp-despliegue.md`.
- `app/api/records/*`, `app/api/users/*`, `app/api/audit/*`, `app/api/agent/*`, `app/api/maestros/*`, `app/api/presupuestos/*`, `app/api/alerts`, `app/api/reports/*`, `app/api/permissions` — REST endpoints, thin wrappers around `lib/*`. `app/api/auth/me/route.js` and `app/api/audit/actors/route.js` exist specifically so the frontend can get session-user info and audit actors over HTTP instead of importing Prisma-backed libs directly.

### Module details (read before touching that module)

| If you are going to touch… | Read |
|---|---|
| Custom roles, Matriz de permisos | `docs/claude/permisos.md` |
| Maestros, Proveedores, Valoración IA, Presupuesto, Solicitudes de compra, Agentes de Compras, Mi correo, Salario mínimo, Nova filters | `docs/claude/compras.md` |
| Bienestar and Fundación (activities, participants, inventory, survey, agents, historias, Nova in Bienestar) | `docs/claude/bienestar.md` |
| Tesorería | `docs/claude/tesoreria.md` |
| Mi día, alertas, configurable notifications | `docs/claude/alertas-notificaciones.md` |
| Estudio de informes, Claude MCP, deploy agent | `docs/claude/informes-mcp-despliegue.md` |
| Frontend (routing, modules and design line 2026, views, charts, formatting, export, `globals.css`) | `docs/claude/frontend.md` |

### Files duplicated across both apps

`lib/session.js`, `lib/roles.js`, and `lib/auditLabels.js` have no Prisma/Node-only dependency, so each app keeps its own copy (`backend/lib/*` and `frontend/lib/*`) rather than sharing a package. `TIPOS_MAESTRO` is duplicated the same way (`backend/lib/maestros.js` ↔ `frontend/lib/maestrosTipos.js`). **When editing any of these, update both copies.**

Anthropic (Claude) is the only AI provider configured in the app — there is no Gemini fallback. `backend/lib/anthropic.js` wraps the Messages API (`ANTHROPIC_API_KEY` env var), `backend/lib/anthropicModels.js` is the model catalog and the model ORDER (`modelosEnOrden()`): every environment uses Claude Haiku 4.5 (an attempt on 2026-11-05 to use Opus/Sonnet in production made Nova answer "Error al conectar con el servicio de IA (401)" and was reverted). `ANTHROPIC_MODELOS` / `ANTHROPIC_MODELOS_AUTO` (comma-separated ids; automatic = work started inside `enSegundoPlano`) change the order without touching code — check first that the production key allows those models. `conModelos(llamada)` runs a call through that list with fallback (used by `aiChatCascade.js` and `aiStructured.js`; a 401/403 does not jump). `DEFAULT_ANTHROPIC_MODEL` = the first of the list, `backend/lib/aiChatCascade.js` is the streaming entry point used by the Agente IA chat, and `backend/lib/aiStructured.js` is the non-streaming structured-JSON entry point used by Informes automáticos, moderation, "Explícame este número", etc. All roles use the same models — there is no paid/free distinction or per-role AI model gating. Cost controls: the Nova chat sends only the INDEX of the procurement policy and the app guide — Nova fetches the sections it needs with the `consultar_referencia` tool (`lib/referenciasNova.js`); the static prefix is cached for 1 h and the last message is a cache breakpoint (incremental caching across tool rounds); tool results are capped at 15k chars and the history at 12 messages; `generateStructuredJson` caches identical requests for 2 h (`cache: false` opts out, used by the purchase valuations). `AI_USAGE_LOG=1` prints each call's `usage` to the backend log to measure real consumption.

- **`legacy/panel-original.html`** (repo root): an incomplete, unreliable leftover fragment from an early failed transcription attempt — not a real reference copy of the original app. Do not treat its contents as authoritative.

## Loading real data

The seed (`backend/prisma/seed-data.json`, loaded by `backend/prisma/seed.mjs` via `npm run db:seed`) is illustrative sample data only. To load the real dataset, replace `backend/prisma/seed-data.json` with a real export in the same shape (`{"records": [...], "meta": {...}}`) and re-run `npm run db:seed` from `backend/` (this does a full `deleteMany()` + recreate, then upserts `Meta`).
