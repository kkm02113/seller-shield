# Slice 1D-1 Case Persistence Implementation Plan

> **For agentic workers:** After human review of this plan, use
> `superpowers:executing-plans` task by task: one primary implementer,
> milestone-local tests and ONE final focused independent review.
> Steps use checkbox syntax. Do not stage, commit or push.

**Status:** IMPLEMENTED — local/test, 2026-10-16. The approved plan is complete;
ONE independent focused code review found no Critical/Important/Minor issue.
No staging, commit, push or Slice 1D-2 work is authorized.

**Goal:** Implement only tenant-safe Case, immutable ClaimSnapshot and append-only
CaseEvent persistence, without Case application services or UI.

**Architecture:** Add three Drizzle tables to the existing PostgreSQL schema.
Reuse the verified actor-first Membership/transaction context; every domain row
requires matching tenant context and ACTIVE Membership. Separate reviewed SQL
migration from explicit migration-owner runtime grants, as in Slice 1C.

**Tech stack:** Existing PostgreSQL 18.6, Drizzle ORM 0.45.3 / Kit 0.31.11,
postgres 3.4.9, TypeScript/Vitest and existing Next.js/Better Auth. No new package
or dependency upgrade.

**Spec:** [Claims](../../domain/claims.md), [physical contract](../../DATABASE.md#tenant-case-tables),
[data model](../../DATA_MODEL.md#case-versus-claim-decision),
[role contract](../../DATA_MODEL.md#identity-roles-and-tenant-ownership),
[security](../../SECURITY.md#tenant-isolation-and-authorization),
[architecture](../../ARCHITECTURE.md#database--decided-slice-1a-foundation-implemented)
and [overall plan](0001-mvp-foundation.md). The user's 1D-1 implementation request
narrows the overall Case slice into persistence (1D-1), services (1D-2) and UI
(1D-3); it does not authorize the rest of the P0 schema.

## Verified preflight

- Clean `Test` at `498d0c7 feat: add workspace onboarding and selection`.
- Fresh `pnpm check`: 20 files / 75 tests PASS.
- Fresh `pnpm test:db`: 11 files / 65 tests PASS, including existing tenancy
  attacks, role/bootstrap boundaries, Membership races and connection reuse.
- Fresh default `pnpm build` and `pnpm db:check`: PASS.
- Existing dedicated loopback synthetic DB only; F8 guard/explicit process
  approval and test-only administrator retained. No setup role changes.
- This plan and its index/status links are task-owned planning changes after
  the clean preflight; they do not require a separate documentation commit.
  Before execution reject unrelated changes or an unexpected baseline change.

## Global constraints

- Exactly `cases`, `claim_snapshots`, `case_events` and one incremental migration.
- Case is the workflow aggregate; snapshots are source material, never a second
  mutable Case or an AI conclusion. Missing optional values remain NULL.
- No CaseRelation/duplicate behavior, service, Inbox/Detail/create UI, Evidence,
  Policy, Response, Artifact, Package, Submission, Outcome, jobs, AI, connectors,
  billing, analytics, invitations or general RBAC.
- No edits to applied migrations, Tenant/Membership policies or existing auth
  contracts. `/app` and workspace UI need no product changes.
- FORCE RLS, non-owner runtime, no BYPASSRLS/schema CREATE/GRANT ALL.
- Explicit WITH CHECK for every allowed write; physical DELETE denied.
- Preserve existing User RESTRICT FKs. No customer retention/anonymization policy
  is decided here; all new destructive paths stay unavailable.
- Real PostgreSQL runtime role for authorization tests, administrator only for
  bounded synthetic fixtures/physical constraints/cleanup/catalog inspection.
- No SQL/error output containing raw source payloads, secrets or real customer
  records. No claims of real-email or production validation.

## Approved contract refinements

Approved on 2026-10-16 and implemented within this persistence boundary.
Database/Claims record CURRENT scope; broader lifecycle operations stay PLANNED.

1. **State storage is not transition authority.** Define all seven `case_state`
   values and the six `case_disposition` values exactly as Claims. CHECK requires
   a disposition if and only if CLOSED. Runtime creation is DRAFT only; no
   runtime INSERT/UPDATE permission on state/disposition in 1D-1. Normalization
   updates are OWNER/OPERATOR-only on DRAFT/GATHERING_EVIDENCE rows. Actual
   DRAFT -> GATHERING_EVIDENCE/early CLOSED transitions belong to 1D-2; later
   review/package/submission/outcome transitions remain unavailable.
2. **Attribution deletion stays RESTRICT.** The physical design makes
   ClaimSnapshot's User SET NULL conditional on retained event attribution.
   That deletion/anonymization procedure does not exist. Use RESTRICT for new
   capture/event actor FKs now, keeping nullable columns where the design is
   nullable; runtime manual writes must name the current actor. No existing FK
   changes. A later explicitly approved retention migration can revisit this.
3. **Human timeline only in this slice.** `event_kind` is checked text with
   CASE_CREATED, CLAIM_SNAPSHOT_ADDED, STATE_CHANGED, CASE_CLOSED. Runtime inserts
   currently allow only the first two by OWNER/OPERATOR; transition events open
   with their authorized operations in 1D-2. `actor_kind='HUMAN'` requires the
   current actor; reserved `source_job_id` must be NULL. No jobs table/FK or
   worker branch is invented. `display_metadata` defaults to `{}` and is
   restricted to `{}` for now: no nonempty metadata contract is justified by
   this persistence slice. Versioned per-event metadata is a later explicit
   extension, not an arbitrary JSON escape hatch.
4. **Ordering is Case-local and caller-supplied.** Positive integer revision plus
   UNIQUE(tenant_id, case_id, revision); concurrent duplicates reject one insert.
   No global sequence or MAX(revision)+1 default. Allocation/retry belongs to
   1D-2's authorized transaction. The unique B-tree also serves latest-revision
   lookup; do not add an equivalent duplicate secondary revision index.

## Review focus

1. Exact foreign Case UUID cannot bypass SELECT or attach a child from another
   tenant, even if the application supplies the wrong Case ID.
2. A normal runtime connection cannot overwrite source/timeline history, move
   ownership, forge another actor or physically delete history.
3. Missing/forged/revoked context never authorizes domain data; a known User UUID
   is attribution, not Membership authority. Pooled context remains local.
4. Full state enums must not accidentally enable future workflow operations or
   allow a closure disposition on a non-CLOSED row.
5. Revision concurrency and failure after partial Case/snapshot/event inserts
   must not duplicate identities or commit incomplete transaction work.

## File map and interfaces

- Create `src/platform/db/schema/cases.ts`: `caseState`, `caseDisposition`,
  `cases`, `claimSnapshots`, `caseEvents`; infer row/insert types from Drizzle.
  Use a local bytea custom type for 32-byte digest data, not a new library.
- Modify `src/platform/db/schema/index.ts`: export only those new declarations.
- Generate `drizzle/0004_case-persistence.sql`, `drizzle/meta/0004_snapshot.json`
  and append journal entry. Review and append FORCE RLS SQL before application;
  never edit this migration after applying it.
- Create `src/platform/db/case-grants.ts`:
  `requireCaseGrantConfiguration(env: Readonly<Record<string,string|undefined>>)`
  returns `{ runtimeUrl, migrationUrl, runtimeRole }` via existing validated
  separate-role configuration; reject unsafe target/role overrides.
- Create `scripts/db-grant-cases.ts`: explicit migration-owner-only idempotent
  grant command; add `db:grant-cases` to `package.json`, no dependency change.
- Create `tests/case-schema.test.ts`, `tests/case-grants.test.ts`,
  `tests/case-persistence.integration.test.ts`,
  `tests/case-isolation.integration.test.ts`,
  `tests/case-revision.integration.test.ts` and scoped fixture helper
  `tests/helpers/case-fixtures.ts` only where the tests share setup.
- Update only obsolete *global inventory expectations* in existing
  `tenancy.integration.test.ts` and `tenant-authorization.integration.test.ts`:
  exact ten public tables and exact old+new policy inventory.
  Preserve every original auth/tenancy column, grant, owner, FK, lock and attack
  assertion; never replace literal inventories with a dynamic subset check.
- Documentation: affected Database/DataModel/Claims/Architecture/Security and
  active-plan status; README only for the added grant/setup command.

## Task 1: Exact code-side physical contract

**Consumes:** the three table sections in Database, canonical states/dispositions
in Claims, GLOBAL `users`, existing `tenants` and Membership role definitions.
**Produces:** the schema exports above; no repository/application service API.

- [x] Write schema tests with literal expected columns/types/nullability,
  FK columns/delete actions, unique/check/index definitions and exact policy
  names. Run `pnpm exec vitest run tests/case-schema.test.ts`; expected RED for
  absent Case declarations, not a missing DB/fixture.
- [x] Implement Case columns exactly from Database: id, tenant_id, title,
  marketplace, external_case_reference, external_order_reference, state,
  closure_disposition, due_at, last_activity_at, created_by_user_id, created_at,
  updated_at, logically_deleted_at. UUID PK/default; composite tenant/id unique;
  tenant/User RESTRICT; approved enum and closure pairing CHECK. No buyer fields.
  Initial created/updated/last-activity timestamps default to now; mutable
  updated_at follows the existing Drizzle on-update convention, not a new trigger.
- [x] Implement ClaimSnapshot: id/tenant/case/revision; source_type/source_label/
  source_url/external_claim_reference; raw_text/raw_payload/content_sha256;
  captured_at/captured_by_user_id/capture_method/created_at. Positive revision,
  one source representation, digest length 32, composite Case FK and approved
  same-Case unique key. Source/capture text must be nonblank without inventing
  marketplace-specific vocabulary. No updated_at or mutable-source path.
- [x] Implement CaseEvent columns exactly from Database and the reviewed narrow
  actor/event/metadata checks above. Composite Case FK and all tenant/User
  relationships RESTRICT; append-only, no automatic event mirroring.
- [x] Add the three documented Inbox/explicit-reference Case indexes, use the
  unique snapshot revision index, and add chronological CaseEvent index.
- [x] Run schema tests and `pnpm typecheck`; expected PASS. Check mutation cases:
  removing composite tenant columns, adding CASCADE, losing closure pairing or
  adding a future-domain column must fail at least one test.

## Task 2: One reviewed migration and minimum runtime grants

**Consumes:** Task 1 tables; existing actor/tenant GUCs and ACTIVE Membership
policy, migration/runtime role split. **Produces:** applied migration 0004 and
`db:grant-cases`; no new privileged role/helper/function/extension.

- [x] Add real-PG catalog/grant assertions and configuration tests first. Run
  their focused unit/DB commands; expected RED on missing tables/policies/grants.
- [x] Define scope SQL as row tenant = local tenant AND own ACTIVE Membership
  for the local actor. Existing Membership SELECT remains nonrecursive and
  unchanged. SELECT allows all three roles; INSERT predicates add current actor
  attribution and OWNER/OPERATOR. Case INSERT additionally requires DRAFT with
  no closure/logical-delete data. Case UPDATE USING/WITH CHECK restricts the
  same tenant, OWNER/OPERATOR and current early states. Snapshot/event have
  SELECT/INSERT only, with the reviewed event-kind scope. No worker branch.
  Policy names are `cases_member_select`, `cases_operator_insert`,
  `cases_operator_update`, `claim_snapshots_member_select`,
  `claim_snapshots_operator_insert`, `case_events_member_select`,
  `case_events_domain_insert`.
- [x] Run `pnpm db:generate --name=case-persistence`; expected one migration
  creating only these three tables, two enums, required constraints/indexes and
  seven new policies. Add ENABLE/FORCE for all three; no edits to 0000–0003.
- [x] Manually inspect all generated SQL/snapshot/journal before applying.
  Stop if anything else is created/altered or the source schema has drifted.
- [x] Implement/redaction-test configuration and grant command. Check runtime
  is non-owner/non-super/non-BYPASS/no schema CREATE or migration/helper member;
  check the three tables are migrator-owned and ENABLE/FORCE before granting.
  Grant SELECT on three tables; explicit INSERT columns only; Case UPDATE only
  normalized fields/title/due_at/last_activity_at/updated_at. Exclude id,
  tenant_id, creator, state, disposition and logical deletion from UPDATE;
  exclude state/disposition/logical deletion from Case INSERT; leave immutable
  rows with no UPDATE/DELETE and metadata/job fields unwriteable.
  Reject query options on the new grant command's runtime/migration URLs so
  driver startup parameters cannot override the inspected target or role.
- [x] Apply `pnpm db:migrate`, then `pnpm db:grant-cases` only to the verified
  local/test target. Expected PASS, one new migration row, ten public tables,
  thirteen total policies (six untouched tenancy + seven Case-domain).
- [x] Repeat grant, then regenerate. Expected idempotent grant and no schema
  changes. Verify no role/provisioning/helper membership change.

## Task 3: Real runtime security, integrity and revision gates

**Consumes:** Tasks 1/2; existing `withTenantContext` and real Better Auth
sessions. **Produces:** passing DB evidence, not application Case operations.

- [x] Add synthetic A/B cases with source snapshots/events under scoped runtime
  transactions. Each side reads only its own rows, even by exact foreign UUID;
  REVIEWER reads but cannot create/edit Case or append source/creation history.
- [x] Prove `(tenant A, case B)` snapshot/event insertion fails SQLSTATE 23503,
  while the corresponding same-tenant insert succeeds. Use deliberate rollback
  for every prohibited write probe, even if unexpectedly allowed.
- [x] Prove normalized Case update never changes captured source. Runtime
  UPDATE/DELETE on snapshot/event and physical Case DELETE fail 42501; actor,
  tenant, state/disposition and history mutation are also denied. Admin-only
  physical constraint probes prove invalid enum/disposition pairing and digest,
  revision, required-source checks; distinguish ACL failures from CHECK tests.
- [x] Prove every approved CLOSED disposition, including LEGITIMATE_RETURN, is
  physically representable without response/outcome tables; normal runtime
  cannot open future transitions or insert an advanced-state Case.
- [x] Test absent actor/tenant, malformed/empty context, revoked membership,
  foreign tenant selection through the real session boundary, forged creator
  and capture/event actor, and cross-tenant UPDATE attempts. Verify same physical
  backend has no domain visibility after commit/rollback context reuse.
- [x] Hold one revision insert uncommitted; use another runtime backend for the
  identical Case/revision, observe the real uniqueness lock wait, commit first,
  assert second 23505 and exactly one row. Independent Cases may both use rev 1.
- [x] Throw after Case + snapshot + event insertion; assert all three roll back.
  Fixture cleanup uses only run-scoped synthetic tenant/Case IDs and reverse FK
  order; no TRUNCATE, RLS disable or weakening of deletion policy.
- [x] Run focused DB suites, then the existing tenancy/auth/pool/bootstrap/race
  suites unchanged apart from exact inventory expansion. Expected all PASS.

## Task 4: Status, regression and one independent review

- [x] Update docs only after local validation. Distinguish full state storage
  from unavailable application transitions, conditional future actor deletion,
  empty current metadata and unsupported job sources. Explicitly list Case
  services, duplicate suspicion, UI, Evidence and AI as NOT IMPLEMENTED.
- [x] Run `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm test:db`,
  default `pnpm build`, `pnpm test:browser`, `pnpm db:check`, `pnpm db:generate`
  and `git diff --check`; expected exit 0, no new schema drift/dependency change.
  Run DB/browser suites sequentially because upstream auth expiry cleanup is
  global. Keep F8 target approval and browser child credential isolation.
- [x] Inspect catalogs for exactly ten tables, five migration rows, thirteen
  policies, FORCE RLS/owner/runtime ACLs and the three tables' composite FKs,
  append-only paths and indexes. Verify pre-existing migrations unchanged.
- [x] Perform ONE read-only independent review of Case/snapshot separation,
  tenant FKs/RLS, source immutability, destructive paths and migration/grant
  scope. No broad security scan or separate reviewers per step. Address real
  findings with reproducing tests and rerun affected/full gates.
- [x] Report in Korean against the user's fifteen final-report headings.
  Leave changes unstaged for the user's manual commit; do not start 1D-2.

## Execution handoff

The established execution method remains one primary implementer, per-milestone
real-PG gates and one final scoped independent review. Plan approval is complete;
the remaining implementation/review evidence follows.

## Execution record — 2026-10-16

- Baseline remains `498d0c7` / Test; only the three task-owned planning docs were
  dirty at execution start. PostgreSQL was stopped; existing dedicated local
  data was restarted without reset, provisioning or role changes.
- Task 1: schema tests 10 failures for absent declarations -> 10 PASS;
  typecheck PASS. Exact columns/types/enums/constraints and seven RLS policies.
- Task 2: catalog tests failed on missing tables before migration; grant
  validation failed query override checks before correction. Four config tests
  PASS. Reviewed SQL/snapshot/journal before applying 0004. Three tables, two
  enums, eight RESTRICT FKs, four secondary indexes, seven policies and FORCE
  RLS only. Grant rerun is idempotent; generation reports no schema changes.
- Task 3: Case suites 20 tests PASS, including actual distinct-backend revision
  lock wait/23505 and three-table rollback. Existing auth/tenancy regression
  passes; total real DB 14 files / 85 tests. Two existing test files had only
  their global table/policy expectations expanded to literal ten/thirteen inventories; all old
  tenancy-specific assertions remain intact.
- Task 4 gates so far: frozen install (no dependency change), `pnpm check`
  (22 files / 89 tests), real `pnpm test:db` (85), default build, existing
  browser regression (6), `db:check` and no-drift generation PASS. Tracked/new
  file whitespace checks PASS; all 115 checked local documentation links exist.
- ONE read-only independent code review of the full uncommitted 1D-1 patch,
  including untracked files, found no concrete Critical/Important/Minor issue.
  The reviewer independently checked code/migration/grants/tests/docs, not a
  second runtime test run. No re-review or broad security scan was performed.
- Final review exclusions accepted: 1D-2 service orchestration/revision retry/
  mandatory domain-event coupling and 1D-3 UI are out of scope, not silently
  implemented. Digest authenticity, retention/anonymization, deployment and
  large-scale performance require later work. Shared-role GUCs still trust the
  authenticated server, not arbitrary SQL clients/compromised DB credentials.
  These remain explicit risks, not new implementation authority.
- Final handoff: changes remain unstaged, HEAD unchanged; no commit/push.
  Existing CODEX_REVIEW_2026-10-14.md was not modified.
- Implementation ruling: Drizzle full-schema `.insert` emits omitted protected
  columns as DEFAULT and fails the approved column ACLs. Keep strict grants;
  consumers must issue explicit-column parameterized SQL through the supplied
  tenant transaction. Atomicity is tested that way; no Case service is added.
  Cost/tradeoff: future 1D-2 writers cannot assume generic full-schema inserts.
- Execution adaptation: work in the user's existing Test checkout and keep
  task-owned planning edits; do not create branches or commit scratch records.
  The plan-scoped ignored ledger retains progress because no commits are made.
- Not implemented: Case creation/read/update services, transition capability,
  revision allocator/retry, duplicate suspicion, CaseRelation, Case UI,
  Evidence/Policy/Response/Outcome/jobs/AI/connectors. No production approval.

Self-review: the three-table scope, source preservation, exact lifecycle,
actor/tenant checks, append-only grants, cross-tenant FKs, revision concurrency,
rollback and existing regression requirements map to Tasks 1–4. Interface and
policy names match across tasks; every review-focus item has an explicit test.
No new product behavior or source-of-truth layer has been marked implemented.
