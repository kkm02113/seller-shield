# Seller Shield / 셀러방패

Seller Shield is currently an executable MVP development shell with a Slice 1A
PostgreSQL/Drizzle foundation. It does not yet contain product database tables,
cases, authentication, tenant handling, marketplace data, evidence handling,
AI, or export functionality.

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
copy the example environment file, and replace both placeholder URLs:

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

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Start the local Next.js development server. |
| `pnpm build` | Create a production build. |
| `pnpm start` | Run the production build. |
| `pnpm typecheck` | Run strict TypeScript checking without emitting files. |
| `pnpm lint` | Run ESLint static analysis. |
| `pnpm test` | Run tests that do not require external services. |
| `pnpm test:db` | Require `DATABASE_URL` and run the real PostgreSQL integration test. |
| `pnpm check` | Run typecheck, lint, and tests in sequence. Run `pnpm build` as a separate production gate. |
| `pnpm db:generate` | Generate reviewed SQL migration files from the Drizzle schema without connecting to PostgreSQL. |
| `pnpm db:migrate` | Apply committed migrations using `DATABASE_MIGRATION_URL`. |
| `pnpm db:check` | Connect using `DATABASE_URL` and execute a real `SELECT 1`. |

The Drizzle schema entry point is intentionally empty. `drizzle/` currently
contains only Drizzle's empty migration journal and no SQL migration or product
table. Running `pnpm db:migrate` creates only Drizzle's
`drizzle.__drizzle_migrations` bookkeeping table, even with zero SQL migrations.
`pnpm db:check` fails when PostgreSQL or `DATABASE_URL` is unavailable;
it never reports synthetic database health. `pnpm test:db` is an explicit DB
gate and fails rather than skipping when `DATABASE_URL` is absent.

`GET /api/health` reports only the Next.js process state. It does not imply
database, storage, AI, authentication, or marketplace health.

Playwright is intentionally deferred: Slice 0 behavior is covered by a
server-rendered shell test, a Route Handler contract test, production build,
and HTTP startup smoke validation without adding browser binaries.
