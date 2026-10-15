# Slice 1C-2 Tenant Authorization Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` for native execution
> or `superpowers:subagent-driven-development` if the user selects that method.
> Execute the checkbox steps in order. Do not commit or push.

**Status:** IMPLEMENTED — locally validated on 2026-10-14. One primary implementer,
milestone-local real-PostgreSQL gates and one independent diff-focused review
completed. Review findings were corrected in one final pass; no second review,
commit or push. The overall Slice 1C design is unchanged.

**Goal:** Establish authenticated actor-first workspace authorization, RLS,
transaction-local context and atomic first-workspace creation, without UI.

**Architecture:** Keep Better Auth identity GLOBAL and Seller Shield Membership
as the only tenant-role authority. A server-session-bound callback executes on
one runtime DB transaction; a restricted database function handles bootstrap.

**Tech Stack:** Existing Node 24, pnpm 11.19.0, Next.js 16.3.7, Better Auth 1.7.7,
PostgreSQL 18, postgres 3.4.9, Drizzle ORM 0.45.3 / Kit 0.31.11 and Vitest 5.0.2.
No dependency additions or version changes.

**Spec:** [Overall plan](0001-mvp-foundation.md),
[ADR-002](../../adr/0002-tenant-isolation.md),
[Database](../../DATABASE.md#rls-and-authorization-model),
[Data model](../../DATA_MODEL.md), [Security](../../SECURITY.md) and
[Architecture](../../ARCHITECTURE.md). The user's approved 1C split places
authorization/bootstrap in 1C-2 and workspace UI in 1C-3.

## Global Constraints

- Start point: clean `Test` branch at `1ccd97f`, manually committed by the user.
- Keep the existing five auth tables, Tenant/Membership columns and constraints.
- Keep ENABLE RLS and FORCE RLS; no runtime ownership or BYPASSRLS.
- Roles: `OWNER` / `OPERATOR` / `REVIEWER`; statuses: `ACTIVE` / `REVOKED`.
- A session is not tenant access. Tenant creator identity is not authority.
- Read actor identity only from a verified server-side Better Auth session.
- Client tenant UUIDs are selectors, not grants; never accept client actor/role.
- Use `app.actor_id` and `app.tenant_id` with transaction-local `set_config`.
- No UI, routes, invitations, membership-management API, organization plugin,
  Case, Evidence, AI, billing or marketplace work. Existing auth UX is unchanged.
- Use real runtime PostgreSQL for authorization assertions, not mocked RLS.
- Admin credentials are setup/test-process-only; never app/deployment inputs.
- Planning edits made after the clean preflight are part of this task, not an
  unrelated dirty baseline. No separate documentation commit is required.

## Review Focus

1. A guessed foreign tenant UUID or forged actor/role hint never grants access.
2. A revoked membership or creator relationship never retains tenant authority.
3. Reused physical connections never retain actor/tenant context after either
   commit or rollback; prove connection identity, not just pool configuration.
4. Concurrent first-workspace requests produce one Tenant/OWNER Membership pair;
   a stale transaction snapshot must not defeat the post-lock ACTIVE recheck.
5. Membership row locking works with minimal grants, but cannot be repurposed
   into membership updates or a helper-role/RLS escape.

## File Map and Interfaces

- `src/platform/db/tenancy-grants.ts`: pure provisioning/grant configuration
  validation, matching the existing `auth-grants.ts` pattern.
- `scripts/db-provision-tenancy.ts`: explicit setup-admin prepare/finalize only.
- `scripts/db-grant-tenancy.ts`: migration-owner runtime grants and safety checks.
- `src/platform/db/schema/tenancy.ts`, `drizzle/0003_tenant-authorization.sql`
  and `drizzle/meta/*`: reviewed policy declarations plus one incremental
  migration; no business tables, no edits to applied migrations.
- `src/platform/db/tenant-context.ts`: transaction boundary factory/types.
- `src/modules/identity/application/context.ts`: bind that factory to the
  existing `db` and `requireUser()`; no client actor input.
- `src/modules/identity/domain/workspace-name.ts`: existing name-contract
  validation, with unit tests; no new naming/product rules.
- `src/modules/identity/application/workspaces.ts`: small service factory and
  session-bound list/create/rename exports; no transport/UI adapter yet.
- Tests: `tests/tenancy-grants.test.ts`, `tests/workspace-name.test.ts`, updated
  `tests/tenancy-schema.test.ts` / `tests/tenancy.integration.test.ts`, and new
  `tests/tenant-authorization.integration.test.ts` /
  `tests/tenant-concurrency.integration.test.ts`. Extract run-scoped fixture
  helpers to `tests/helpers/tenancy-fixtures.ts` only where those files reuse them.
- Scripts/env/setup: `package.json`, `.env.example`, `README.md`.
- Status updates after validation: Architecture, Database, Data Model, Security,
  ADR-002 and the overall plan. Do not rewrite unrelated sections.

## Task 0: F8 Database-Test Target Guard

- [x] Add a test-only target guard before DB integration/browser clients are
  initialized. Reject non-`*_test` database names by default and reject supplied
  runtime/migration/admin URLs that identify different database endpoints.
  Reject URL query options rather than trusting pathname/user inspection alone.
- [x] Permit the existing dedicated local synthetic DB only with process-only
  `ALLOW_DESTRUCTIVE_DB_TESTS=1` plus an exact credential-free
  `DATABASE_TEST_TARGET=host:port/database` and loopback URLs. This opt-in is
  an operator assertion, not proof that arbitrary data is disposable. Capture
  approval before env-file loading; saved flags cannot authorize a later run.
  Explicitly clear administrative URLs and test approvals in browser-server
  child environments so only runtime credentials are inherited by Next.
- [x] Prove fail-closed behavior, wrong-target/remote override denial and
  secret-free errors with unit tests, then run the existing real-DB baseline.
- [x] Keep F1 proxy/recipient controls and deletion policy as real-customer
  production gates; F3/timeout test improvements are separate follow-up work.
  Do not modify `CODEX_REVIEW_2026-10-14.md`.

## Task 1: Restricted Roles, Policies and Bootstrap Migration

**Interfaces:**
- `Environment = Readonly<Record<string, string | undefined>>`.
- `requireTenancyGrantConfiguration(env: Environment): { runtimeUrl: string;
  migrationUrl: string; runtimeRole: string }`; validate distinct roles on the
  same database.
- `requireTenancyProvisionConfiguration(env: Environment)` returns that shape
  plus `{ provisionUrl: string; migrationRole: string }` and also requires
  `DATABASE_PROVISION_URL`, an explicit distinct setup-admin connection on that
  same database. Never fall back to runtime/migration/test-admin URLs.
- Commands: `db:provision-tenancy --prepare`, `db:provision-tenancy --finalize`,
  `db:grant-tenancy`; retain all existing commands unchanged.
- Function: `public.create_first_workspace(workspace_name text) RETURNS uuid`.

- [x] Write configuration tests for missing/malformed URLs, cross-database or
  shared-role URLs and secret-free errors. Write real-PG catalog/ACL/policy
  assertions that initially fail against the committed default-deny baseline.
- [x] Run `corepack pnpm exec vitest run tests/tenancy-grants.test.ts` and
  targeted `test:db` assertions; confirm failures are the missing behavior,
  not a missing database or fixture failure.
- [x] Implement the two configuration functions and prepare/finalize script.
  Use the fixed helper `seller_shield_bootstrap`: NOLOGIN, NOSUPERUSER,
  NOBYPASSRLS, NOCREATEDB, NOCREATEROLE, NOREPLICATION, NOINHERIT; not table owner.
  Reject unsafe existing helper/runtime roles rather than silently changing them.
  Prepare grants only temporary migrator-to-helper role membership; runtime
  must never become a helper member. Finalize revokes that temporary membership.
- [x] Declare and generate exactly these policies. Preserve schema constraints;
  mark the externally provisioned helper role as existing in Drizzle so schema
  generation does not create an extra role or become its provisioning authority.

  | Policy | Command / predicate |
  | --- | --- |
  | `memberships_actor_select` | SELECT own ACTIVE rows; no query of Membership or Tenant inside its predicate. |
  | `memberships_actor_lock` | UPDATE USING own ACTIVE rows, WITH CHECK false; row-lock support only. |
  | `tenants_member_select` | SELECT if an own ACTIVE Membership exists; actor-only discovery is intentionally allowed without selected tenant. |
  | `tenants_owner_update` | UPDATE only selected tenant with own ACTIVE OWNER Membership; matching WITH CHECK. |
  | `tenants_bootstrap_insert` | Helper-only INSERT: creator equals actor. |
  | `memberships_bootstrap_insert` | Helper-only INSERT: actor equals user/creator, OWNER, ACTIVE, revoked_at NULL. |

  Ordinary actor policies may be TO PUBLIC at the RLS layer; table ACLs remain
  explicit and narrow. The helper reuses actor-self SELECT, not a broad helper
  SELECT policy. Missing/empty context yields no access; malformed UUIDs fail
  closed. Never introduce recursive Membership SELECT policies.
- [x] Append the function to the generated incremental migration. Set
  `search_path = pg_catalog, pg_temp` and `row_security = on`; qualify tables.
  Read the actor GUC, reject missing/invalid actor and unsupported isolation
  levels, require READ COMMITTED, take an actor-keyed advisory transaction lock,
  then recheck ACTIVE Membership. Generate UUIDs before INSERT: no Tenant
  SELECT or INSERT RETURNING is needed. Insert Tenant and OWNER Membership
  atomically. Existing ACTIVE Membership rejects bootstrap; historical REVOKED
  Membership alone does not. Propagate errors; do not swallow partial failures.
- [x] Transfer function ownership to the helper. Grant helper public-schema
  CREATE only temporarily inside the migration, then revoke it in that same
  transaction. Revoke PUBLIC function EXECUTE in the creation transaction.
  Helper gets only required INSERT columns and Membership SELECT(user_id,
  status) for the actor-self ACTIVE recheck; no Tenant SELECT or UPDATE/DELETE.
- [x] Implement runtime grants: SELECT Tenant/Membership, Tenant UPDATE(name,
  updated_at), Membership UPDATE(id) for locking, and EXECUTE on the single
  bootstrap function. No tenancy INSERT/DELETE, ALL TABLES, default privileges,
  schema CREATE, ownership, helper membership or role/status UPDATE grants.
- [x] Apply prepare -> migrate -> grant -> finalize to the existing dedicated
  local/test database, using process-only setup credentials. On failure, do
  not leave temporary membership/schema CREATE active; report and restore the
  bounded provisioning state before stopping. Verify repeat invocation safety.
  The initial function EXECUTE grant uses a migrator-only SET LOCAL helper role
  before membership revocation; repeated grants need no helper membership.
- [x] Run targeted unit/catalog tests. Prove on real PG that SELECT FOR SHARE
  succeeds under the lock policy while UPDATE(id = id) fails. If that policy
  mechanism is incompatible, stop and report the exact error before weakening
  privileges/RLS or inventing a replacement design.

## Task 2: Session-Bound Transaction Context

**Interfaces:**
- `TenantTransaction`: transaction callback type derived from existing `Database`.
- `MembershipRole`: `(typeof memberships.$inferSelect)["role"]` from the existing
  schema (`OWNER` / `OPERATOR` / `REVIEWER`), not an independent role definition.
- `AuthenticatedActorContext = { actorId: string; tx: TenantTransaction }`.
- `AccessContext = AuthenticatedActorContext & { tenantId: string;
  membershipId: string; role: MembershipRole }`.
- `createTenantBoundary(database: Database, loadActor:
  () => Promise<{ id: string } | null>)` produces generic methods
  `withAuthenticatedActor<T>(operation: (context: AuthenticatedActorContext)
  => Promise<T>): Promise<T>` and `withTenantContext<T>(tenantId: string,
  operation: (context: AccessContext) => Promise<T>): Promise<T>`.
- Production exports bind `loadActor` to `requireUser()`. The factory seam is
  for server composition/tests, never a client-facing actor override.

- [x] Add real-PG tests using verified Better Auth sessions for A/A and B/B
  success, A/B and B/A denial, unauthenticated/expired-session denial, REVOKED
  denial, and supplied client actor/role hints having no effect. Foreign and
  nonexistent tenants share a non-disclosing authorization failure.
- [x] Run targeted DB tests and confirm the new boundary is missing/failing.
- [x] Implement the server-only boundary with READ COMMITTED transactions.
  Load authenticated actor first; set local actor and clear local tenant.
  Resolve the requested own ACTIVE Membership with FOR SHARE, read its role,
  then set the canonical Membership tenant locally and invoke the callback.
  `withAuthenticatedActor` sets actor only for discovery/bootstrap. All callback
  queries use the supplied transaction; no global DB escape or migration URL.
- [x] Run the targeted tests. Assert callback actor/tenant/membership/role match
  the locked DB row, commit returns the callback value and thrown callbacks
  roll back. No callback runs when identity/membership validation fails.

## Task 3: Minimal Workspace Application Services

**Interfaces:**
- `requireWorkspaceName(input: unknown): string`: normalize boundary spaces and
  enforce the existing btrim/char_length 1..80 contract, counting code points.
- `WorkspaceSummary = { id: string; name: string; role: MembershipRole }`.
- `createWorkspaceService(boundary)` exposes `listWorkspaces():
  Promise<WorkspaceSummary[]>`, `createFirstWorkspace(name: unknown):
  Promise<WorkspaceSummary>` and `renameWorkspace(tenantId: string,
  name: unknown): Promise<WorkspaceSummary>`. Export production-bound wrappers.

- [x] Write name unit tests (non-string, empty, boundary spaces, 80/81 Unicode
  code points) and real-PG tests for own ACTIVE workspace discovery, one
  atomic first-workspace pair, repeated ACTIVE bootstrap denial, OWNER rename
  success and OPERATOR/REVIEWER rename denial. Creator-with-REVOKED Membership
  has no access; missing selected tenant cannot authorize an update.
- [x] Run `corepack pnpm exec vitest run tests/workspace-name.test.ts` and
  targeted DB tests; confirm the new service behavior fails before coding.
- [x] Implement services using Task 2 callbacks only. Bootstrap calls the
  one-argument function inside the actor transaction, then reads its created
  workspace through normal runtime RLS. Rename requires OWNER while the
  Membership lock is held, updates only name/updated_at, and preserves creator.
- [x] Run these tests; verify bad names, absent/invalid actor and callback failure
  leave neither a Tenant nor a Membership. Keep all auth/onboarding behavior.

## Task 4: Concurrency, Pool and Regression Gates

**Interfaces:** Uses Task 1 roles/function and Task 2/3 APIs. Setup-admin access
is confined to synthetic run-scoped fixtures, revocation orchestration and
catalog checks; runtime performs every authorization/operation assertion.

- [x] Add same-actor two-connection bootstrap concurrency (exactly one success
  and one Tenant/OWNER pair), different-actor independence, READ COMMITTED
  enforcement and repeatable-read rejection tests. Every unexpected successful
  prohibited write must roll back; cleanup is restricted to fixture IDs.
- [x] Add single-connection pool tests. Assert identical `pg_backend_pid()` for
  A transaction -> no-context probe -> B transaction, for both commit and
  rollback. No-context reads see no tenancy rows, writes fail; B cannot see A.
  Test empty/malformed GUCs and direct runtime foreign-tenant identifier access.
- [x] Add revocation-race test: FOR SHARE holds the Membership until operation
  completion; observe the competing revocation lock wait in PostgreSQL, not
  timing-only sleeps. A new operation after revocation must be denied.
- [x] Assert helper ownership/flags, fixed search_path, PUBLIC EXECUTE revoked,
  runtime SET ROLE helper denied, helper not table owner and no broad SELECT.
  Preserve all existing physical schema, FK, CHECK and auth contract tests.
  Replace obsolete zero-policy/zero-ACL assertions with exact reviewed policies
  and grants; do not simply remove the security tests.
- [x] Run the focused real-PG tests; confirm all attack/race cases pass before
  updating implementation status. No mock database claims count as evidence.
- [x] Document setup order and the provision-only variable in README/.env.example.
  Record that shared-role GUCs trust the authenticated server: they do not
  authenticate arbitrary SQL clients or protect compromised runtime credentials.
  Update only affected status/boundary sections, keeping UI/Case PLANNED.
- [x] Run `corepack pnpm install --frozen-lockfile`, `corepack pnpm check`,
  `corepack pnpm test:db`, default `corepack pnpm build`, and `git diff --check`.
  Expected: exit 0, no skipped authorization gates, no lockfile/dependency drift.
- [x] Perform the selected execution method's final focused independent review,
  resolve findings, rerun affected checks and report changes/evidence in Korean.
  Do not stage, commit, push, or start 1C-3.

## Verified Preflight and Remaining Gates

2026-10-13/14 preflight: clean `Test` at `1ccd97f`; PostgreSQL `db:check` passed;
`pnpm check` passed (13 files / 51 tests). Read-only catalog inspection found
the seven expected tables, no public RLS policies/SECURITY DEFINER functions,
and no bootstrap helper role. No grants/migrations were applied during planning.

Execution and local validation are complete. FOR SHARE under the narrow UPDATE
policy succeeds while actual UPDATE remains denied. Distinct-backend bootstrap
advisory-lock waiting, revocation races and physical connection reuse are verified.
Linux/CI and production deployment remain separate unverified environments.

## Execution record — 2026-10-14

- Dependencies and applied `0000`–`0002` migrations unchanged; exactly one
  incremental `0003` migration applied. Final catalog: seven tables, four
  migrations, six policies; runtime non-owner/non-superuser/non-BYPASSRLS,
  ENABLE/FORCE retained, no temporary helper members or schema CREATE.
- Pinned `pnpm install --frozen-lockfile`: already up to date.
- Final `pnpm check`: 18 files / 65 tests; `pnpm test:db`: 10 files / 58 tests
  with explicit dedicated-loopback target approval and test-only administrator.
- Default Turbopack `pnpm build` and existing Edge/capture-email browser tests
  (3 tests) pass. Browser requests still use the pre-existing capture handler;
  this does not close F3's real sign-in/Resend wiring gap.
- Default non-test DB invocation without opt-in fails at configuration startup,
  before a client is created. New F8 tests cover file-only approvals, query
  target/user overrides and child-server credential isolation.
- `pnpm db:generate`: no drift; `git diff --check`: pass. Local documentation
  references and untracked task-file whitespace checked separately.
- One independent scoped review: no Critical finding or concrete tenancy bypass;
  three Important F8 defects reproduced RED→GREEN and fixed in one pass.
  Current/planned documentation conflicts corrected; bootstrap contention proof
  now observes distinct backends and an actual advisory lock wait. No re-review.
- No commit/push/staging; `CODEX_REVIEW_2026-10-14.md` preserved unchanged.
  F1 proxy trust/recipient limits precede public email; F3/timeout remain separate
  improvements. Deletion/retention policy precedes real customer data; existing
  RESTRICT FKs remain unchanged. At this slice's completion workspace UI was
  still assigned to 1C-3 and not implemented.

### Successor boundary — 2026-10-15

The user approved 1C-2 local/test and committed baseline `13262fc`. Slice 1C-3
now connects workspace UI to these unchanged services/policies; implementation
and current validation belong to the [overall active plan](0001-mvp-foundation.md#slice-1c-3--workspace-onboarding-and-selection).
This does not reopen the completed 1C-2 scope or authorize a new schema/RLS model.

PostgreSQL references for implementation checks:
[row locking privileges](https://www.postgresql.org/docs/18/sql-select.html),
[secure function creation](https://www.postgresql.org/docs/18/sql-createfunction.html),
[function ownership transfer](https://www.postgresql.org/docs/18/sql-alterfunction.html),
[RLS policy semantics](https://www.postgresql.org/docs/18/ddl-rowsecurity.html).
