# Seller Shield / 셀러방패

Seller Shield is currently an executable MVP development shell. It does not yet
contain cases, authentication, tenant handling, marketplace data, database
access, evidence handling, AI, or export functionality.

Durable product and architecture knowledge lives in [`docs/`](docs/README.md).

## Local setup

Prerequisites:

- Node.js 24 LTS (`24.19.0` is pinned in `.node-version`)
- pnpm `11.19.0` (pinned in `package.json`)

Install and start:

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

Open <http://localhost:3000>. No environment variables are required for Slice
0, so there is no `.env.example` yet.

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Start the local Next.js development server. |
| `pnpm build` | Create a production build. |
| `pnpm start` | Run the production build. |
| `pnpm typecheck` | Run strict TypeScript checking without emitting files. |
| `pnpm lint` | Run ESLint static analysis. |
| `pnpm test` | Run the Vitest shell and health-route tests. |
| `pnpm check` | Run typecheck, lint, and tests in sequence. Run `pnpm build` as a separate production gate. |

`GET /api/health` reports only the Next.js process state. It does not imply
database, storage, AI, authentication, or marketplace health.

Playwright is intentionally deferred: Slice 0 behavior is covered by a
server-rendered shell test, a Route Handler contract test, production build,
and HTTP startup smoke validation without adding browser binaries.
