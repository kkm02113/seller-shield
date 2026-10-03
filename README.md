# Seller Shield / 셀러방패

Seller Shield currently has an executable MVP development shell, the Slice 1A
PostgreSQL/Drizzle foundation, and Slice 1B-1 Better Auth persistence. Four
GLOBAL auth tables and database-session infrastructure exist; usable sign-in,
tenant authorization, cases, marketplace data, evidence, AI, and exports do not.

Durable product and architecture knowledge lives in [`docs/`](docs/README.md).

## Local setup

Prerequisites:

- Node.js 24 LTS (`24.19.0` is pinned in `.node-version`)
- pnpm `11.19.0` (pinned in `package.json`)
- PostgreSQL 18.6, only when running database commands

Install and start:

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

Open <http://localhost:3000>. No environment variables are required for Slice
0 or the current application shell.

For migration application or connectivity checks on a fresh machine, provision
the local database and roles described in [`docs/DATABASE.md`](docs/DATABASE.md#slice-1a-foundation--implemented-local-validation),
copy the example environment file only if `.env.local` does not already exist,
and replace both placeholder URLs:

```powershell
Copy-Item .env.example .env.local
```

`DATABASE_URL` is the server-only application connection. The intended
production role is non-owner and must not bypass RLS once RLS exists.
`DATABASE_MIGRATION_URL` is reserved for the separate schema-owner role used by
Drizzle Kit. Do not commit `.env.local` or reuse the migration owner at application
runtime. Database commands load `.env.local` before `.env`; existing process
environment variables take precedence over both, including temporary test
overrides. PostgreSQL installation and role provisioning are local setup, not
an application startup side effect or a production provisioning system.

Authentication requests additionally require server-only `BETTER_AUTH_SECRET`
(random, at least 32 characters; the example placeholder is rejected) and
`BETTER_AUTH_URL` (local HTTP origin or deployment HTTPS origin). Add missing
keys to an existing `.env.local` without overwriting its database credentials.
Generate a local secret yourself, for example:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
pnpm db:check
pnpm db:migrate
pnpm db:grant-auth
pnpm test:db
```

`db:grant-auth` uses the migration owner only for explicit CRUD grants on the
four auth tables. It requires separate roles on the same database and refuses
an elevated/runtime owner role. It does not provision roles or grant schema
CREATE, ownership, or default privileges. See the
[physical schema and local validation](docs/DATABASE.md#slice-1b-1-foundation--implemented-local-validation).
The official handler is mounted at `/api/auth/[...all]`; no sign-in method is
enabled. Missing auth configuration fails closed with a generic 503. The
public shell and build do not initialize auth or require its secret.

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Start the local Next.js development server. |
| `pnpm build` | Create a production build. |
| `pnpm start` | Run the production build. |
| `pnpm typecheck` | Run strict TypeScript checking without emitting files. |
| `pnpm lint` | Run ESLint static analysis. |
| `pnpm test` | Run tests that do not require external services. |
| `pnpm test:db` | Require `DATABASE_URL` and run real PostgreSQL smoke, adapter, session, privilege, and negative-path tests. |
| `pnpm check` | Run typecheck, lint, and tests in sequence. Run `pnpm build` as a separate production gate. |
| `pnpm db:generate` | Generate reviewed SQL migration files from the Drizzle schema without connecting to PostgreSQL. |
| `pnpm db:migrate` | Apply committed migrations using `DATABASE_MIGRATION_URL`. |
| `pnpm db:check` | Connect using `DATABASE_URL` and execute a real `SELECT 1`. |
| `pnpm db:grant-auth` | Grant only auth-table CRUD to the runtime role using the separate migration owner. |

The schema entry point exports only `users`, `accounts`, `sessions`, and
`verifications`. `drizzle/0000_auth-foundation.sql` is the single reviewed
migration, with its snapshot/journal; it creates no tenant/product-domain
tables. Do not translate the full planned schema into one migration.
`pnpm db:check` fails when PostgreSQL or `DATABASE_URL` is unavailable;
it never reports synthetic database health. `pnpm test:db` is an explicit DB
gate and fails rather than skipping when `DATABASE_URL` is absent.

`pnpm build` remains `next build` (default Turbopack). It passed in the working
tree and a fresh Windows snapshot on 2026-10-04. `--webpack` is a diagnostic
fallback, not a substitute for this gate. See the
[release-gate record](docs/plans/active/0001-mvp-foundation.md#slice-1b-1--better-auth-persistence-foundation)
for the historical native-SWC block and validation limits.

`GET /api/health` reports only the Next.js process state. It does not imply
database, storage, AI, authentication, or marketplace health.

Playwright is intentionally deferred: Slice 0 behavior is covered by a
server-rendered shell test, a Route Handler contract test, production build,
and HTTP startup smoke validation without adding browser binaries.
