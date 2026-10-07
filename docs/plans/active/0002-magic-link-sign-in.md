# Slice 1B-2 Implementation Plan

> For agentic workers: use superpowers:executing-plans for inline TDD execution.
> User approved implementation with final corrections; do not commit or push.

**Goal:** Email-only sign-in through non-consuming confirmation, database
sessions, authenticated name onboarding, and a minimal account landing page.

**Status:** COMPLETED / APPROVED — local/test (approved 2026-10-06;
implementation and local automated validation completed 2026-10-04).
One fresh-context review covered 51 changed files and found no actionable issue
or plausible security candidate. The reviewed working-tree snapshot precedes
only homepage import/EOF housekeeping and these execution-record updates;
affected checks are rerun after them. Real Resend delivery and real-customer
production approval remain separate gates, not implied by local completion.

**Plan ownership:** This is the Slice 1B-2 implementation/validation record,
subordinate to the [authoritative overall MVP plan](0001-mvp-foundation.md).

**Architecture:** Extend the existing Better Auth HTTP boundary. One EmailSender
port delegates to Resend; real PostgreSQL tests inject a test-only capture sender.
Only the official rate-limit model is added to the four core tables.

**Tech Stack:** Better Auth/adapter 1.7.7, PostgreSQL 18.6, existing Drizzle/Next.js,
Resend stable SDK, direct Zod boundary validation, focused UI/browser tests.

**Spec:** [approved architecture](../../ARCHITECTURE.md#slice-1b-2--implemented-local-validation),
[physical contract](../../DATABASE.md#slice-1b-2-global-authentication-rate-limit-infrastructure--implemented),
[security gates](../../SECURITY.md#slice-1b-2-controls--implemented-local-validation).

## Global Constraints

- expiresIn 300; storeToken hashed; signup enabled; database sessions; cache OFF.
- Email `/auth/verify#token=...`; GET does not call verification; human action only.
- Initial blank name allowed; authenticated trim + 1..80-character update required.
- Built-in DB limiter only, Magic Link 5/60s; UI countdown 60s, no email limiter.
- Session IP/UA and trusted proxy settings OPEN; leave upstream behavior intact.
- Resend/Tokyo approved for code; US processing/30-day retention blocks real customers
  until review. Real account/domain gates external delivery, not capture tests.
- No Tenant, Membership, RLS, Case, organization, password, OAuth, billing,
  marketplace features, custom limiter, queues, or production fixture endpoints.
- Implementation started from a clean Test baseline; preserve unrelated files.
  Commit/push remain user-managed. Slice 1C requires a clean committed 1B-2 baseline.

## Review Focus

- Fragment-only link opening must not consume tokens or create a User/Session.
- Bad/reused/expired links and mail errors must fail safely, without secret output.
- Returning unfinished users and direct API name updates cannot bypass onboarding.
- Parallel HTTP requests/independent auth instances cannot exceed the DB limit.
- Arbitrary redirects and resend UI refresh must not be misrepresented as controls.

### Task 1: Official rate-limit schema and runtime grants

**Files:** `src/platform/db/schema/rate-limit.ts`, schema entry, auth factory,
`scripts/db-grant-auth.ts`, auth schema/config/real-DB tests, one new migration.
**Interfaces:** `schema.rateLimits` maps official model `rateLimit` to `rate_limits`;
`createAuthentication(db, environment, sender?)` retains current DB/env contract.

- [x] Write schema/config tests: official fields plus UUID, unique key, bigint epoch;
  expect only four core tables plus rateLimits, no domain tables/plugins.
- [x] Run `pnpm exec vitest run tests/auth-schema.test.ts tests/auth-config.test.ts`;
  expected RED for absent rate-limit model/DB storage.
- [x] Add the model, built-in DB storage, narrow grants; compare pinned upstream
  schema before `pnpm db:generate --name=auth-rate-limit`, review SQL (one new table).
- [x] Apply with migration role, run db:grant-auth, retain runtime CREATE/ALTER denial.
- [x] Run existing unit and DB schema checks; expected GREEN, five tables/38 columns,
  unchanged core fields/FKs, added unique rate-limit key, migration replay a no-op.

### Task 2: Email port and Magic Link HTTP contract

**Files:** `src/platform/email/{sender,env,resend}.ts`,
`src/platform/auth/{factory,magic-link,validation}.ts`,
`tests/{email,magic-link}.test.ts`, `tests/magic-link.integration.test.ts`.
**Interfaces:** `EmailSender.send({to,subject,html,text}): Promise<void>`;
factory sender injection; `confirmationURL(origin, token): string`;
fixed callback `/auth/callback`, error `/sign-in`.

- [x] Write RED tests for missing/invalid mail env, SDK returned errors, escaped
  content, fragment-only links, fixed redirects and 1..80 trimmed names.
- [x] Run focused tests; expected missing behavior failures, not passing mocks.
- [x] Add Resend/Zod stable pinned dependencies. Lazy server-only mail secrets;
  sender failures are static/redacted and awaited, no success on missing config.
- [x] Configure official Magic Link 300/hashed/5-per-60s; enforce fixed HTTP
  callbacks and no pre-login name, validate all User name updates server-side.
- [x] Write RED real-PG HTTP tests with captured email: new/returning user,
  hashed storage/expiry/reuse/concurrent consume, cookie+DB session, sender failure,
  unsafe redirect, and parallel limiter sharing across instances.
- [x] Run focused unit + real-PG tests; expected GREEN. Capture only external email,
  never mock PostgreSQL or change production verification cleanup to isolate tests.

### Task 3: Sign-in, confirmation, onboarding, account and sign-out UI

**Files:** `src/platform/auth/{client,session}.ts`, `src/app/{sign-in,auth/verify,
auth/callback,onboarding,app}/`, focused UI tests, auth page headers, minimal CSS.
**Interfaces:** current DB session guards; client mutations use official HTTP,
no server auth.api Magic Link calls. `/app` checks blank name server-side.

- [x] Write RED interactive tests for email submit/errors/countdown, confirmation
  with no automatic requests, invalid fragments, trimmed name/error display.
- [x] Add test-only DOM dependencies and semantic forms using existing shell styles.
- [x] Implement explicit-click official verification navigation; no analytics/assets.
- [x] Add server guards/callback and account-only landing; logout via official POST.
- [x] Run focused UI/guard tests; expected GREEN. Public shell/build remain DB-lazy.

### Task 4: Browser validation, documentation and independent auth/security review

**Files:** `tests/e2e/magic-link.spec.ts`, `playwright.config.ts`, package scripts,
README, ARCHITECTURE/DATABASE/SECURITY, foundation active plan.
**Interfaces:** real PostgreSQL + running Next.js; capture sender in test process
only (no runtime test flags/endpoints); real Resend delivery remains separate.

- [x] Add browser tests for actual confirmation → session → onboarding → account,
  scanner-safe initial GET, returning/unfinished user, invalid/reused link, logout.
- [x] Run against existing Edge headlessly; report any environment limitation honestly.
- [x] Run frozen install, check, test:db, build, migration replay, diff/path checks.
- [x] Update CURRENT/OPEN/BLOCKED records with measured results, not production claims.
- [x] Obtain one fresh-context scoped review; fix important findings with RED→GREEN.
- [x] Re-run affected checks and report changed files, coverage and remaining gates.
  Leave changes uncommitted; independent audit does not approve real Resend delivery.

## Validation and handoff — 2026-10-04

- Frozen installation, strict typecheck, lint and all 48 unit/UI tests passed.
- All 18 real PostgreSQL tests passed, including hashed/expired/reused tokens,
  single-success concurrent verification, returning-user/name controls and the
  shared official 5/60s limit. No PostgreSQL mock or fake health result.
- Default Turbopack production build and 3 installed-Edge flows passed. Browser
  sign-in POST uses the same real factory/PG with test-only captured email;
  verification/session/name/guards/logout use the running Next.js application.
- `db:check`, no-change `db:generate`, migration replay and explicit five-table
  CRUD grants passed; existing DDL-denial assertions remain intact.
- All AGENTS routes, 85 local documentation links and 24 heading anchors exist.
  No dedicated repository documentation validator is configured. Local secret
  values do not appear in changed/new files; env and scratch remain ignored.
- No commits/staging/push. No real mail was sent. Linux/CI remains unverified;
  the approved Node runner is 24.19.0, not a claim of validation on earlier minors.

## Pre-commit verification — 2026-10-06

- `pnpm check` passed: typecheck, lint, and all 48 unit/UI tests.
- `pnpm db:check` and all 18 `pnpm test:db` tests passed after restarting the
  existing local PostgreSQL 18.6 cluster. The initial DB run failed with
  `ECONNREFUSED` while the server was stopped; no application/test/configuration
  change, installation, or migration was used to make it pass.
- Default `pnpm build` passed. Browser validation remains the 2026-10-04 record;
  it was not repeated for this documentation-only cleanup.
- `git diff --check` passed; the untracked plan's whitespace check had no
  findings. A redacted comparison of all 51 changed/new Git-visible files found
  no configured local auth/DB/Resend secret values. Environment, scratch and
  Playwright output paths remain ignored; staging is empty.
- Slice 1C implementation has not started. Slice 1B-2 still requires the user's
  manual commit and a clean working tree before the next slice begins.

Remaining real-customer pilot/production gates: Resend account/domain/DNS/API key,
Tokyo sending
and tracking OFF settings, actual inbox + confirmation flow, trusted proxy and
session IP/User-Agent operating policy, deployment query-log redaction, and
accepted overseas processing/retention policy before real-customer production.
These gates do not block local Slice 1C development after its clean-baseline gate.
Tenant/Membership/RLS/Case and all other excluded product work are still absent.
