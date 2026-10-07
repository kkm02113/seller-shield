# MVP Foundation Implementation Plan

> **Status:** Active implementation plan. Slice 0 is IMPLEMENTED. Slice 1A
> is IMPLEMENTED and APPROVED after real-PostgreSQL validation on 2026-10-01;
> Slice 1B-1 persistence is IMPLEMENTED and APPROVED within the local validation
> boundary below on 2026-10-04; Slice 1B-2 is COMPLETED and APPROVED — local/test
> on 2026-10-06. Slice 1C onward remains PLANNED. This is the authoritative overall
> execution plan; slice-specific plans are subordinate implementation records.
> Execution must follow the root `AGENTS.md`;
> do not commit or push unless a later task explicitly requests it.

Slice 1B-1's design was revised on 2026-10-01 to Better Auth persistence;
Auth.js v5 beta is not approved. That design-only revision changed documentation, not
dependencies, generated schemas, migrations, or application behavior.
The design is approved for implementation as of the 2026-10-02 review, using
registry-verified stable 1.7.7 and `usePlural: true`. Implementation started from
clean `Test` at `b7d773c50e319439b6a6d3354313ac898bef5139`, matching local HEAD,
origin/Test, and remote Test. The documentation baseline was already committed;
no new documentation commit or history rewrite was performed.

**Goal:** Deliver the smallest tenant-safe, manual-first workflow that takes a
real seller claim from intake through evidence review, human-approved response
package, externally performed submission, and recorded outcome.

**Spec:** [`docs/PRODUCT.md`](../../PRODUCT.md), with authoritative case and
evidence semantics in [`docs/domain/claims.md`](../../domain/claims.md) and
[`docs/domain/evidence.md`](../../domain/evidence.md), and aggregate/schema
guidance in [`docs/DATA_MODEL.md`](../../DATA_MODEL.md) and
[`docs/DATABASE.md`](../../DATABASE.md).

**Repository starting point:** The repository began with documentation only and
now contains the verified Slice 0 executable foundation plus the Slice 1A
PostgreSQL/Drizzle infrastructure. The stack, planned file layout, tenant
boundary, evidence-storage pattern,
AI boundary, policy reproducibility, export strategy, and deployment shape are
decided in [`docs/ARCHITECTURE.md`](../../ARCHITECTURE.md) and `docs/adr/`.
The conceptual data model is decided in
[`docs/DATA_MODEL.md`](../../DATA_MODEL.md), and the implementation-ready
physical PostgreSQL design is decided in
[`docs/DATABASE.md`](../../DATABASE.md). Application shell, database tooling,
four core-auth tables plus `rate_limits`, two migrations, and the Better Auth
Magic Link/onboarding flow now exist, with separate runtime/migration roles
verified locally. Product-domain tables,
production role provisioning, RLS
policies, and all later product code remain unimplemented until later slices.
Provider selections explicitly left open below are not capabilities.

## Global constraints

- Preserve original claim content and evidence separately from normalized,
  derived, or AI-generated material.
- Every tenant-owned read and write must enforce the tenant boundary.
- Important factual assertions must remain traceable to evidence or an
  attributable, point-in-time reproducible policy reference.
- A legitimate return and closing without a response must remain supported
  paths.
- AI does not fabricate evidence, policy, or misconduct and does not submit.
- LLM availability must not be required to create, approve, or export a
  manually written response package.
- A tenant-authorized human approves package finalization and records external
  submission.
- Marketplace connectors are not required for the MVP P0 validation loop.
- Each slice must produce a user-observable, independently testable increment.
- Slice 0 is time-boxed enablement, not an infrastructure platform.

## Review focus across slices

- Cross-tenant identifiers must never expose another tenant's case or evidence.
- Missing data must remain missing instead of being normalized into guessed
  values.
- Original and derived material must remain distinguishable through UI,
  storage, export, and audit history.
- A case must be closable as a legitimate return without creating a response.
- Provider, export, or storage failure must not advance workflow state or erase
  the last valid version.

## Slice 0 — Executable project foundation

> **Implementation status:** IMPLEMENTED on 2026-09-29. Validation: pnpm
> install from the repository lockfile, strict typecheck, ESLint, two Vitest
> tests, production build, and HTTP startup smoke checks. Playwright was
> evaluated and deferred because no interactive or critical browser flow exists
> yet.

### Goal

Create the smallest single-package Next.js application skeleton and quality
gates needed for the first product slice.

### User-visible outcome

A developer can start the application locally and see a minimal Seller Shield
shell and health state. No claim-management capability is presented as built.

### Domain involved

None beyond the product name and documentation routes.

### Backend work

- Create the Node.js Next.js App Router entry point and a Route Handler health
  check using the planned repository layout.
- Add no environment variables unless the executable shell actually requires
  them; no future-provider configuration is invented.
- Establish Vitest, strict TypeScript typecheck, ESLint, and build commands.
- Evaluate a one-flow Playwright smoke test, but defer its dependency and
  browser binaries when a smaller render/Route Handler test proves Slice 0.

### Frontend work

- Create the Next.js App Router application shell with Server Components by
  default.
- Show an explicit empty/not-yet-implemented state rather than fictional case
  data.
- Use semantic markup and test the shell's essential identity/status text.

### Data changes

- No database dependency, schema, migration, role, or PostgreSQL test harness is
  introduced in Slice 0. Those begin with the Slice 1 tables that need them.

### Security and privacy

- Commit no secrets and create no `.env.example` when no configuration exists.
- Use synthetic data only.
- Document which security controls remain unimplemented.

### Tests

- Application startup or health check.
- Minimal frontend render/smoke test.
- Health response claims process readiness only.
- Quality commands run in a clean local checkout.

### Acceptance criteria

- The repository documents exact local start, test, lint/type, and build
  commands selected by implementation.
- A fresh developer can run the minimal shell using documented local setup.
- No product capability, provider, or security control is claimed without an
  implementation and test.

### Explicit out of scope

- Authentication, tenant provisioning, cases, evidence, AI, exports,
  production deployment, observability platforms, and marketplace connectors.

## Slice 1 — Tenant boundary and manual case workflow

> **Implementation status:** Slice 1A database infrastructure is IMPLEMENTED
> and APPROVED on 2026-10-01 after local PostgreSQL 18.6 validation. It includes the
> initially empty Drizzle schema, separate runtime/migration URL validation, migration
> commands, a real `SELECT 1` smoke path, and an explicit `pnpm test:db` gate
> that fails when no database is configured. Slice 1B-1 persistence and Slice
> 1B-2 sign-in/onboarding are IMPLEMENTED and APPROVED within local/test limits.
> Slice 1C (Tenant/Membership/RLS), 1D (Case/ClaimSnapshot/CaseEvent), and 1E (manual
> Create → Inbox → Detail) remain PLANNED.

Slice 1A validation record: `pnpm install --frozen-lockfile`, `pnpm check`
(15 tests), `pnpm build`, `pnpm db:check`, `pnpm db:migrate`, and `pnpm test:db`
(1 real-DB test) passed. Each DB command also failed with a deliberately wrong
password and emitted no password or connection URL. Actual role flags,
ownership, and runtime CREATE denial were checked as described in
[`docs/DATABASE.md`](../../DATABASE.md#slice-1a-foundation--implemented-local-validation).
`.env.local` and tool scratch are ignored; PostgreSQL data lives outside Git.
Zero SQL migrations and zero product tables were the approved Slice 1A
boundary. Slice 1B-1 now adds only the core-auth migration below.

### Slice 1B-1 — Better Auth persistence foundation

**IMPLEMENTED, APPROVED LOCAL VALIDATION (2026-10-04).** Only global authentication
persistence with `better-auth@1.7.7`,
`@better-auth/drizzle-adapter@1.7.7`, the existing PostgreSQL/Drizzle foundation,
and database-backed sessions. Version/configuration ownership remains in
[`ARCHITECTURE.md`](../../ARCHITECTURE.md#authentication-and-tenant-model);
the exact four-table contract and mappings remain in
[`DATABASE.md`](../../DATABASE.md#global-better-auth-core-tables).

- Configure the server-only auth boundary, required secret/base URL validation,
  and existing non-owner runtime database connection. Do not alter the CLI/test
  environment loader into an application-runtime loader.
- Verify registry versions again before installing. Use `usePlural: true` with
  the four plural schema exports and `advanced.database.generateId: "uuid"`.
- Generate Better Auth's core schema for review, compare it with the physical
  contract, and resolve UUID, timestamp, field/default/index, and mapping
  differences **before** generating migration SQL. Then review the four-table
  migration and narrowly scoped runtime CRUD grants.
- Validate the real adapter's core persistence and database-session lookup,
  expiry, and revocation with synthetic fixtures on real PostgreSQL. Direct
  test fixture setup is not a production sign-in flow; mocked persistence is
  not integration coverage. Test configuration failures without leaking values.
- Keep User GLOBAL. Do not add Tenant/Membership/RLS, Better Auth organization
  or authorization-role plugins, Magic Link, email/password or OAuth sign-in,
  transactional email, login UI, Case, evidence, AI, storage, or jobs.
- Do not enable secondary storage, stateless JWT sessions, or cookie caching
  that bypasses the authoritative database-session lookup.

Acceptance requires reviewed schema/SQL matching the documented core contract,
real runtime-role adapter/session tests, and the existing application checks
remaining valid. Local DB absence or unverified generation is a reported
blocker, not permission to claim passing integration coverage. Implementation
starts only after the approved documentation has a clean committed baseline.

Initial validation (2026-10-02): `pnpm install --frozen-lockfile`, `pnpm check` (35 unit tests),
official `auth@1.7.7 generate` / `check schema`, `pnpm db:check`, reviewed
`pnpm db:generate`, `pnpm db:migrate`, `pnpm db:grant-auth`, and `pnpm test:db`
(12 real-DB tests) passed. Repeated generation/migration produced no new schema
change. Default `pnpm build` failed because Windows application-control policy
blocked native SWC required by Turbopack; `pnpm build --webpack` passed using
WASM as a diagnostic fallback, not the default build gate. No script, type
check, or host security policy was weakened.

Release-gate audit (2026-10-04): default `pnpm build` now passes with native
Turbopack both in the working tree and a fresh Windows snapshot. All 67
Git-visible source files matched by SHA-256 before and after snapshot validation,
including the uncommitted implementation over baseline `b7d773c`. Node
24.19.0, pnpm 11.19.0, and the unchanged lockfile were used; no `node_modules`,
`.next`, `.env.local`, or `.superpowers` was copied. Frozen-lockfile installation,
`pnpm check` (35 tests), and default build passed in the snapshot. In the working
tree, `pnpm check`, `pnpm test:db` (12 real-DB tests), `pnpm db:check`,
`pnpm db:migrate`, `pnpm db:grant-auth`, and `git diff --check` passed after
restarting the existing local PostgreSQL cluster.

The historical failure occurred before application compilation while loading
`@next/swc-win32-x64-msvc@16.3.7` / `next-swc.win32-x64-msvc.node`. Windows
Code Integrity events 3033 and 3077 on 2026-10-02 identify policy
`VerifiedAndReputableDesktop` and status `0xc0e90002`. Native loading succeeds
in the audit; why the earlier block no longer reproduces is UNKNOWN. No host
security policy, build configuration, dependency, or authentication behavior
was changed, and no webpack fallback was needed. Linux validation remains
unverified: WSL is not installed, Docker is unavailable, and no CI was added.
Approval is limited to local persistence validation, not sign-in, tenant
authorization, Linux deployment, or production provisioning.

Final fresh-context review found one test-isolation issue: Better Auth's internal
Verification lookup also globally prunes expired rows. Test read assertions now
use identifier-scoped adapter reads; an unrelated expired sentinel regression
failed before the correction and passed after it. Production cleanup settings
were not changed. Multi-process/repeated-identifier sign-in semantics remain
1B-2 validation, not a claim from the single-row concurrency fixture here.

### Slice 1B-2 / 1C boundary

Slice 1B-2 owns the official Better Auth Magic Link plugin, its `sendMagicLink`
delivery callback, transactional email provider/region/data terms, and sign-in
UI. This flow is locally implemented with captured email and verified against
real PostgreSQL/Edge; blank initial names require authenticated onboarding.
Resend is selected, while actual delivery and overseas processing/retention
acceptance remain separate gates. Session IP/User-Agent and trusted proxy
decisions remain OPEN. See the [implementation plan](0002-magic-link-sign-in.md).
These operational gates block real-customer pilot/production approval, not local
Slice 1C development. Slice 1C owns Seller Shield Tenant/Membership/server
authorization/RLS, with no parallel organization abstraction in the auth library.
Do not start Slice 1C implementation until Slice 1B-2 is manually committed and
the working tree is clean.

### Whole Slice 1 goal

Let an authenticated seller operator create and review tenant-scoped cases
through the initial lifecycle without a marketplace connector.

### User-visible outcome

The operator can create a claim manually, see it in the Case Inbox, open Case
Detail, preserve original claim content, and move between `DRAFT`,
`GATHERING_EVIDENCE`, and an allowed early `CLOSED` disposition.

### Domain involved

Tenant, actor, Case, ClaimSnapshot, Case state, Case disposition, and
attributable state transition.

### Backend work

- Establish authentication integration and tenant context using the selected
  provider and authorization model.
- Implement tenant-scoped case create, list, read, update, and allowed state
  transition operations.
- Preserve original claim input separately from normalized fields.
- Record actor and time for case creation and state transitions.
- Detect a possible duplicate using only explicit identifiers and surface it
  for review; do not silently merge.

### Frontend work

- Case Inbox with honest empty, loading, and failure states.
- Manual case creation that permits a draft with missing optional information.
- Case Detail that visibly separates original claim content, normalized data,
  missing fields, state, and disposition.
- Human-controlled state transition and closure-reason actions.

### Data changes

- Tenant, tenant membership or equivalent actor relationship.
- Case aggregate with immutable ClaimSnapshot revisions, separate normalized
  working values, state, and closure disposition.
- Attributable transition or audit record sufficient for the case history.
- Exact schema names and columns follow the stack decision and must be reviewed
  against the domain document before implementation.

### Security and privacy

- Deny cross-tenant create, list, read, update, and transition access.
- Enforce authorization server-side; client filtering is not a security
  boundary.
- Keep sensitive claim data out of logs and test fixtures.
- Use synthetic fixtures for automated tests.

### Tests

- Tenant A cannot list, read, update, or close Tenant B's case, including by
  direct identifier.
- Missing optional fields remain missing and the case stays a valid draft.
- Original claim content is not changed by normalization edits.
- Invalid state transitions are rejected.
- A case can close as `LEGITIMATE_RETURN` without a response.
- Duplicate suspicion never automatically merges or labels a person.

### Acceptance criteria

- An authenticated operator completes manual create → inbox → detail.
- Every returned case is tenant-scoped and every mutation is authorized.
- Only transitions allowed by `docs/domain/claims.md` are accepted.
- Audit attribution exists for creation and state changes.
- No marketplace capability is implied.

### Explicit out of scope

- Evidence files, readiness, policy references, AI, package generation,
  outcome tracking, billing, invitations, advanced organization management,
  and marketplace import.

## Slice 2 — Evidence Vault and provenance

### Goal

Let an authorized operator attach, inspect, and remove references to original
case evidence without losing provenance or confusing derived content with the
original.

### User-visible outcome

The operator can add an evidence file or external reference, categorize it,
record its known source, see provenance and verification limitations, and view
all evidence for the case.

### Domain involved

Evidence item, category, Artifact/StoredObject, external reference, provenance,
derived Artifact relationship, and evidence access.

### Backend work

- Implement authorized evidence create/reference, list, metadata update,
  retrieval, and removal-from-case operations.
- Issue upload URLs only for unique staging keys; after authorized checksum/
  metadata validation, promote server-side to a different unique final key and
  record only that final original/version.
- Keep stored original content immutable; metadata corrections are auditable.
- Relate every derived artifact to one or more source items.
- Handle upload/reference failure atomically so no false evidence record is
  created.

### Frontend work

- Evidence Vault in Case Detail with category, source, actor, time, media type,
  and known verification limitation.
- Add-file and add-reference flows with progress, failure, empty, and unknown-
  provenance states.
- Clearly label original versus derived material.

### Data changes

- Evidence metadata and Case relationship, separate from stored bytes.
- Immutable original Artifact or external-reference locator.
- Derived-to-source relationship.
- Evidence access and metadata-change audit events.

### Security and privacy

- Authorize metadata and content access separately where storage requires it.
- Prevent predictable storage identifiers from bypassing tenant checks.
- Apply safe upload constraints and content handling selected with the storage
  provider; do not claim malware or media verification unless implemented.
- Respect the provisional retention rule chosen before real customer evidence
  is stored.

### Tests

- Cross-tenant evidence metadata and content access are denied.
- Failed uploads leave no completed evidence item.
- Reusing an unexpired staging upload URL cannot change an already finalized
  original.
- Original content cannot be overwritten through metadata update.
- Derived material always retains source relationships.
- Unknown provenance remains explicitly unknown.
- Every MVP evidence category is accepted; arbitrary categories are rejected or
  require an explicit domain change.

### Acceptance criteria

- A seller can add and retrieve source-attributable evidence for a case.
- The UI and API distinguish original, external reference, and derived
  material.
- Removal behavior is auditable and follows the selected retention rule.
- No upload is treated as authentic merely because storage succeeded.

### Explicit out of scope

- OCR, computer vision, media forensics, authenticity scoring, automatic
  marketplace collection, public sharing, and formal legal chain-of-custody
  certification.

## Slice 3 — Review readiness, timeline, and policy reference

### Goal

Help an operator determine whether the case has enough visible, attributable
material for a human response-or-close decision.

### User-visible outcome

The operator sees a case timeline, known gaps and conflicts, the evidence
readiness state, and an attributable marketplace policy reference. The
operator can confirm `READY_FOR_REVIEW` or return to collection.

### Domain involved

Evidence readiness, case timeline, basic claim normalization, policy reference,
case review decision, and allowed state transitions.

### Backend work

- Build the timeline from attributable domain events instead of duplicated
  free-form history.
- Implement case-specific gap/conflict records and the readiness assessment.
- Allow a human to confirm `REVIEWABLE`; automated logic may only suggest it.
- Attach manually sourced marketplace policy references with version/effective
  context when known, source URL, retrieval time, captured text or snapshot,
  and a content digest for the captured representation.
- Preserve the point-in-time policy basis used by the case even if the source
  URL later changes.
- Support the documented transitions into and out of `READY_FOR_REVIEW`.

### Frontend work

- Chronological case timeline with actor/source distinctions.
- Evidence readiness panel showing `NOT_ASSESSED`, `GAPS_IDENTIFIED`, or
  `REVIEWABLE` plus missing, conflicting, unavailable, and unverified items.
- Manual policy-reference attachment and source display.
- Review action that explicitly offers response preparation or closure as a
  legitimate return/not-disputable case.

### Data changes

- Gap/conflict/unavailable-item records or equivalent structured assessment.
- Readiness status and human confirmation attribution.
- Policy source URL, marketplace, version or effective context, retrieval time,
  captured text/snapshot reference, content digest, and case relationship.
- Timeline uses existing audit/domain events; add only events missing for this
  user-visible history.

### Security and privacy

- Readiness, timeline, and policy references inherit tenant authorization.
- Policy content from external sources must retain attribution and must not be
  presented as official if provenance is incomplete.
- Avoid embedding unnecessary customer PII in policy or gap records.

### Tests

- AI or rules can suggest but cannot confirm `REVIEWABLE`.
- Known gaps prevent a silent claim of completeness.
- Conflicting evidence displays both sources.
- Policy reference without a source is visibly incomplete and cannot be
  invented by the system.
- A changed live source URL does not alter the captured policy basis for an
  existing case, and digest mismatch is detected.
- A reviewable case can close as a legitimate return.
- Timeline ordering is stable and actor/source attribution is preserved.

### Acceptance criteria

- The operator can explain why the case is or is not ready for review.
- The policy basis is attributable and version/effective context is preserved
  when known.
- `READY_FOR_REVIEW` is human-confirmed and does not force response creation.

### Explicit out of scope

- Automated policy ingestion, automatic policy applicability decisions,
  marketplace scraping, outcome prediction, and buyer-risk scoring.

## Slice 4 — Manual and AI-assisted response draft

### Goal

Let an operator create a reviewable response draft manually and optionally use
AI assistance without fabricating facts or hiding uncertainty.

### User-visible outcome

For a `READY_FOR_REVIEW` case chosen for response preparation, the operator can
write and version a draft without an LLM. If AI is configured, the operator may
request suggestions, inspect material assertions with support and uncertainty
labels, and edit or reject generated language.

### Domain involved

Response draft, draft origin, selected evidence set, policy basis, generated
assertion, uncertainty label, draft version, and human correction.

### Backend work

- Implement manual response-draft create, edit, and version operations without
  any LLM dependency.
- Introduce the selected LLM/provider boundary only for optional assistance,
  with data-minimizing input and explicit output validation.
- Generate suggestions only from the selected case material and policy
  reference.
- Store prompt/input reference, model/provider version where available, output,
  citations, uncertainty labels, and draft version without treating output as
  evidence.
- Reject or flag unsupported references and preserve provider failures without
  advancing case state.

### Frontend work

- Manual draft editor available for every eligible case, including when no LLM
  provider is configured.
- Optional AI-assistance action limited to an eligible case.
- Review view that connects material assertions to evidence/policy references.
- Visible `SUPPORTED`, `CONFLICTING`, `MISSING`, `UNVERIFIED`, and `INFERENCE`
  meanings.
- Editing, rejection, retry, and provider-failure states with version history;
  provider failure never disables manual editing.

### Data changes

- Response-draft version and origin (`MANUAL` or `AI_ASSISTED`), selected source
  references, generated assertions when present, uncertainty labels,
  provider/model metadata when present, and human edits.
- Audit event for generation, retry, edit, and rejection.

### Security and privacy

- Send only required tenant data to the approved provider.
- Keep secrets server-side and out of logs, exports, and client bundles.
- Apply approved provider retention, region, training-use, and deletion terms.
- Prevent cross-tenant retrieval through prompt, citation, cache, or draft
  references.

### Tests

- Generated assertions cannot reference evidence outside the case or tenant.
- Unsupported provider output is rejected or visibly labeled, never promoted
  to `SUPPORTED`.
- Conflicting sources remain visible in the draft review.
- Missing policy or evidence produces a warning rather than invented content.
- Provider timeout/error leaves the prior draft and case state intact.
- With no configured or available LLM, a human can create and save a complete
  manual response draft.
- AI cannot transition the case to `PACKAGE_READY` or `SUBMITTED`.

### Acceptance criteria

- Every material draft assertion has evidence/policy support or an explicit
  uncertainty label.
- Original evidence and claim content remain unchanged.
- Human edits and rejected suggestions are measurable for validation.
- No generated draft is presented as approved or externally submitted.
- Manual drafting remains fully usable when AI is disabled or unavailable.

### Explicit out of scope

- Autonomous legal conclusions, buyer misconduct scoring, provider auto-
  switching, model fine-tuning, image interpretation, and external submission.

## Slice 5 — Human approval, package export, and submission record

### Goal

Let a human approve a specific evidence-grounded package, export it reliably,
and separately record an external submission.

### User-visible outcome

The reviewer can inspect the final support, approve a package version, download
the export, and later record that it was submitted through the marketplace's
existing process.

### Domain involved

Response package, package version, reviewer approval, export artifact,
submission record, and transitions to `PACKAGE_READY` and `SUBMITTED`.

### Backend work

- Accept either a manual or AI-assisted response draft and validate that
  material factual assertions have support or explicit permitted uncertainty
  before approval.
- Create an immutable approved package version linked to its evidence set,
  policy reference, draft version, reviewer, and approval time.
- Generate the selected export format idempotently or preserve a safe retry
  path.
- Record external submission as a separate human action; do not call a
  marketplace submission API in P0.

### Frontend work

- Final evidence/policy/assertion review with blocking issues surfaced.
- Explicit approve/finalize action with reviewer confirmation.
- Export progress, retry, and failure states.
- Separate "record external submission" action that cannot be mistaken for an
  automatic submission button.

### Data changes

- Package version with live references plus an immutable PackageManifest
  snapshot and digest.
- Human approval attribution.
- Export artifact metadata and failure/retry status.
- Seller-entered external submission time/reference and actor.

### Security and privacy

- Exports are tenant-authorized and must not expose unrelated evidence or
  secrets.
- Package artifacts follow the evidence retention/access rules.
- Approval and submission actions are auditable and protected from replay or
  accidental double recording.

### Tests

- Unsupported factual assertions block approval.
- A removed or inaccessible evidence reference blocks or invalidates a pending
  package rather than silently disappearing.
- Export failure does not lose the approved package version.
- Repeated export does not create contradictory package content.
- Only an authorized human can approve or record submission.
- Approval never performs an external network submission.
- Both manual and AI-assisted drafts can be approved and exported through the
  same response-package path.

### Acceptance criteria

- An authorized reviewer can approve and export a stable package whose support
  is inspectable.
- Package version, evidence, policy, reviewer, and approval are attributable.
- External submission remains a separately recorded human action.
- Case transitions match `docs/domain/claims.md`.

### Explicit out of scope

- Autonomous submission, marketplace connector, electronic signature,
  certified delivery, legal filing, and advanced document-template systems.

## Slice 6 — Outcome tracking and validation instrumentation

### Goal

Close the validation loop by recording seller-entered outcomes and the minimum
workflow measurements needed to assess MVP value.

### User-visible outcome

The operator can record a seller-favorable, seller-unfavorable, partial,
no-decision, or other result with notes and see the case as resolved. Product
operators can derive the validation metrics defined in `docs/PRODUCT.md`
without exposing cross-tenant case data.

### Domain involved

Outcome, resolution event, terminal state, seller-entered data provenance,
workflow timing, and human draft correction.

### Backend work

- Record the documented outcome category, notes, actor, time, and external
  reference when known.
- Transition `SUBMITTED` to `RESOLVED` only through an authorized human action.
- Capture the minimum attributable events needed to calculate preparation time,
  package time, readiness, correction, repeat-use, and case-volume metrics.
- Keep seller-reported outcomes distinguishable from directly verified
  marketplace data.

### Frontend work

- Outcome entry with unknown/no-decision and other states.
- Resolved case view showing the package, submission, and result timeline.
- Clear label that the recorded result is seller-entered unless independently
  verified in a future integration.

### Data changes

- Outcome category, notes, actor, recorded time, and optional external
  reference.
- Terminal resolution event.
- Minimal metric events or derivable timestamps; no broad analytics warehouse.

### Security and privacy

- Outcome and metric data remain tenant-scoped.
- Aggregate product analysis must avoid exposing case-level PII or allowing one
  tenant to infer another tenant's activity.
- Retention/deletion applies to derived metrics as well as source cases.

### Tests

- Only `SUBMITTED` can transition to `RESOLVED`.
- Unknown/no-decision is not counted as seller-favorable or unfavorable.
- Seller-entered outcome is labeled and auditable.
- Metric calculation excludes paused/waiting time where the selected
  preparation-time definition requires active time.
- Cross-tenant outcome and metric access is denied.

### Acceptance criteria

- A submitted case can reach a documented terminal outcome.
- The source and certainty of the outcome are visible.
- The MVP validation metrics can be calculated without inventing platform
  verification or building a general analytics system.

### Explicit out of scope

- Automated marketplace outcome synchronization, benchmarking sellers or
  buyers, public success-rate claims, predictive outcome scoring, and a general
  BI platform.

## Conditional post-P0 slice — Marketplace connector

This is not part of the committed MVP v0.1 P0 plan. Consider a Coupang-oriented
connector only after real-case validation shows that manual intake creates a
material adoption or time barrier and official capabilities, terms, data
access, and reliability have been verified. Naver and other marketplaces remain
later hypotheses. A connector must not bypass tenant isolation, provenance,
human approval, or the manual fallback.

## Resolved architecture decisions

| Decision | Resolution |
| --- | --- |
| Application structure | Single containerized TypeScript Next.js App Router modular monolith; [ADR-001](../../adr/0001-single-nextjs-application.md). |
| Persistence | PostgreSQL with Drizzle ORM and reviewed Drizzle Kit SQL migrations; ADR-001. |
| Physical schema | GLOBAL Better Auth core tables, tenant-owned domain tables with composite tenant FKs/RLS, and a SYSTEM job queue; [`docs/DATABASE.md`](../../DATABASE.md). |
| Authentication and tenant isolation | Better Auth database sessions and GLOBAL User identity; separate Seller Shield Tenant/Membership with `OWNER`/`OPERATOR`/`REVIEWER`, server authorization plus PostgreSQL RLS; [ADR-002](../../adr/0002-tenant-isolation.md). |
| Evidence storage/integrity | Private S3-compatible storage, authorized short-lived URLs, immutable original keys, SHA-256; [ADR-003](../../adr/0003-evidence-storage-and-integrity.md). |
| AI boundary | Manual response drafting is primary; optional provider adapter with validated references; [ADR-004](../../adr/0004-manual-first-ai-boundary.md). |
| Export | Versioned HTML → PDF through pinned Chromium/Playwright; one PDF in P0; [ADR-005](../../adr/0005-html-to-pdf-export.md). |
| Policy reproducibility | Manual point-in-time capture with source/retrieval/effective context, captured representation, and SHA-256; [ADR-006](../../adr/0006-policy-reference-reproducibility.md). |

## Open decisions

These provider and operational decisions remain unresolved. "Blocks" means
implementation of that slice cannot responsibly use real external/customer
data without the decision; the open option is not a product capability.

| Decision | Why it matters | Decide by | Blocks Slice 0 | Blocks Slice 1 |
| --- | --- | --- | --- | --- |
| Hosting, managed PostgreSQL, and deployment region | Determines production operations, data location, backups, and processor terms. The container/PostgreSQL/S3 topology is already decided. | Before production deployment, not before local Slice 0. | No | No |
| Transactional email provider and region | Required for real Better Auth Magic Link sign-in; the separate Seller Shield tenant/role model is already decided. | Before Slice 1B-2 uses real users. | No | Yes, 1B-2 only; not 1B-1 |
| S3-compatible storage vendor and bucket region | Determines provider-specific signed URL/checksum behavior, data location, deletion, and cost; the storage boundary is already decided. | Before Slice 2 accepts real evidence. | No | No |
| Provisional evidence retention and deletion policy | Real customer evidence cannot be stored responsibly without an initial rule and deletion path. | Before Slice 2 accepts real data. | No | No |
| LLM provider, approved data terms, region, model boundary, and fallback behavior | Determines optional AI assistance, privacy review, prompt/data flow, observability, failure handling, and cost. It does not block manual drafting. | Before the AI-assisted portion of Slice 4 starts. | No | No |
| Error-reporting provider and data-scrubbing configuration | Determines production exception visibility and third-party PII exposure. | Before production monitoring is enabled. | No | No |
| Marketplace policy ingestion strategy | P0 permits manual attributable references; automated refresh may add legal, scraping, and versioning risk. | Before any automated policy ingestion, not before manual P0. | No | No |
| Coupang API connector before or after the first pilot | Official capability and value are unverified; premature integration may dominate MVP cost. Manual case creation is the P0 fallback regardless. | After manual-case validation or earlier only if verified access is a pilot prerequisite. | No | No |

## Plan completion boundary

This plan is complete when Slices 0–6 pass their acceptance criteria with real
implementation evidence and the product documents are updated to distinguish
implemented behavior from remaining plans. The conditional connector requires
a separate approved plan after its validation gate.
