# Seller Shield architecture — MVP v0.1

## Status vocabulary

- **DECIDED:** an approved architecture decision for implementation.
- **PLANNED:** behavior assigned to an MVP slice but not implemented.
- **IMPLEMENTED:** code/configuration exists and the documented validation has
  passed for the stated boundary.
- **NOT IMPLEMENTED:** no application code or verified runtime control exists.
- **OPEN:** a provider or operational choice that can remain unresolved without
  changing the architecture boundary.

As of 2026-10-04 the Slice 0 shell, approved Slice 1A PostgreSQL/Drizzle
foundation, and Slice 1B-1 Better Auth persistence are **IMPLEMENTED** within
the local validation boundaries below. Four GLOBAL auth tables, database
sessions, and non-owner runtime CRUD grants exist. Usable sign-in, product
tables, Tenant/Membership, RLS, storage, tenant authorization/isolation, AI,
export, worker, and deployment remain **NOT IMPLEMENTED**. Local database setup
is not production provisioning or proof of tenant isolation.

## Recommended architecture — DECIDED

Use one containerized TypeScript Next.js App Router application with:

- React Server Components by default and Client Components only for interactive
  forms, upload progress, and response editing;
- Server Actions for UI-originated mutations;
- Route Handlers for uploads, downloads, health, and machine-facing HTTP;
- Zod at external and provider boundaries;
- PostgreSQL with Drizzle ORM and reviewed Drizzle Kit SQL migrations;
- Better Auth database-backed sessions;
- private S3-compatible object storage;
- optional LLM assistance behind a narrow server-side port;
- HTML-to-PDF generation through pinned Chromium/Playwright;
- PostgreSQL-backed jobs, with a same-image worker introduced only when Slice
  4/5 runtime evidence requires it.

This is a modular monolith: one repository, one application package, one
database, and one deployment unit initially. It deliberately excludes
microservices, Kubernetes, Kafka, Redis, event sourcing, CQRS, vector databases,
RAG infrastructure, and a general workflow engine.

The decision is recorded in
[ADR-001](adr/0001-single-nextjs-application.md).

## Alternatives considered

### Next.js frontend + FastAPI backend

Rejected for MVP v0.1. No confirmed workload requires Python, and AI provider
calls do not justify a second runtime. This option would add API-contract,
deployment, local-development, tracing, and validation overhead before product
value is validated.

### FastAPI with server-rendered UI

Rejected for MVP v0.1. It keeps one service but provides a less direct path for
the interactive evidence-upload, readiness, citation, and response-review UI.

### Static/serverless-only Next.js

Rejected. Authenticated database work, private object access, long-running AI
and PDF operations, and pinned Chromium require a Node server runtime. Some
serverless hosts terminate long-running handlers or provide no persistent
filesystem, so deployment must not assume static export semantics.

## Repository layout

`src/app/`, `src/platform/db/`, `src/platform/auth/`, the single core-auth
migration, and the corresponding unit/real-DB tests are implemented.
`src/modules/`, other platform adapters, `src/worker/`, tenant/product migrations,
and the larger test hierarchy remain planned.

```text
seller-shield/
├─ src/
│  ├─ app/                       # Next.js routes, layouts, actions, handlers
│  ├─ modules/
│  │  ├─ identity/              # users, tenants, memberships, authorization
│  │  ├─ cases/                 # claim intake, state, timeline
│  │  ├─ evidence/              # provenance, access, readiness, artifacts
│  │  ├─ policies/              # point-in-time policy references
│  │  ├─ responses/             # manual/AI drafts, packages, submissions
│  │  ├─ exports/               # package manifest and PDF jobs
│  │  └─ outcomes/              # seller-entered results and metrics events
│  ├─ platform/
│  │  ├─ auth/                  # Better Auth adapter and session translation
│  │  ├─ db/                    # Drizzle foundation; tenant boundary is planned
│  │  ├─ storage/               # S3-compatible implementation
│  │  ├─ ai/                    # one provider adapter implementation
│  │  ├─ pdf/                   # Playwright renderer
│  │  └─ observability/         # logs, request IDs, error reporting
│  └─ worker/                   # added only when durable jobs require a process
├─ drizzle/                     # reviewed core-auth SQL + snapshot/journal
├─ tests/
│  ├─ unit/
│  ├─ integration/
│  └─ e2e/
├─ docs/
├─ AGENTS.md
├─ package.json                 # created in Slice 0
└─ next.config.*                # created in Slice 0
```

Do not add `packages/` until code is genuinely shared by independently useful
consumers. Do not add a separate API application until a measured runtime or
team boundary requires it.

## Frontend — DECIDED; Slice 0 shell IMPLEMENTED

- **Language/framework:** TypeScript, React, Next.js App Router.
- **Rendering:** Server Components for authenticated reads and first render;
  Client Components only for browser APIs and interactive state.
- **Forms:** semantic HTML forms plus Server Actions; Zod validates on the
  server. Client validation improves feedback but is never authoritative.
- **Data fetching:** Server Components call application services directly. Do
  not fetch the application's own Route Handlers from the server. Use client
  polling only for upload/job progress; no global query library initially.
- **State:** local component state and URL state. No Redux or other global state
  library in MVP v0.1.
- **Testing:** Vitest for pure logic, React Testing Library for focused
  interactive components, and Playwright for critical browser flows.

The implemented Slice 0 UI is one semantic Server Component shell with no
fictional business data. React Testing Library and Playwright are not installed
because there is no interactive component or critical browser workflow yet; a
server-rendered Vitest test covers the current shell.

## Backend and API — DECIDED; health/auth persistence mounts IMPLEMENTED

Next.js runs on the Node.js runtime and hosts the application layer.

Slice 0 implements only `GET /api/health`, returning process status with no
database, storage, AI, authentication, or marketplace claim. Slice 1B-1 adds
the official auth mount described below, without enabling sign-in. Product
application services and other adapters below remain **NOT IMPLEMENTED**.

- Server Actions and Route Handlers are thin adapters. They authenticate,
  validate, build an `AccessContext`, call one application service, and map the
  result to UI/HTTP.
- Application services own use-case orchestration and authorization checks.
- Domain modules own states and invariants and do not import Next.js, Better Auth,
  Drizzle, S3, Playwright, or an LLM SDK.
- Infrastructure adapters remain under `src/platform/` and implement narrow
  ports owned by the consuming module.
- Do not create a generic repository/service abstraction hierarchy. Each module
  exposes only the operations its use cases require.

External input and structured provider output use Zod. Database constraints
remain authoritative for uniqueness and referential integrity.

### Background work

| Operation | MVP execution | When a worker becomes required |
| --- | --- | --- |
| Evidence upload | Direct private S3 upload with authorized finalize request | Digest/inspection exceeds a bounded request or provider checksum cannot be trusted directly. |
| AI suggestion | PostgreSQL job record; may execute inline with timeout first | Hosting timeout, retry reliability, or measured latency requires durable polling. |
| PDF export | PostgreSQL job record with idempotency; may execute inline first | Chromium runtime or retry behavior exceeds the bounded request. |

The worker, when introduced, uses the same package, modules, database, and
container image. `background_jobs` is a SYSTEM-scoped queue: the worker claims
one job across tenants, obtains its `tenant_id`, then performs domain work in a
separate tenant-scoped transaction under ordinary RLS. The worker has no
general `BYPASSRLS`; only the queue table exposes a cross-tenant claim policy.
PostgreSQL job claiming with `FOR UPDATE SKIP LOCKED` is sufficient for MVP. Do
not add Redis or an external queue without measured contention or throughput
evidence.

## Database — DECIDED; Slice 1A foundation IMPLEMENTED

- The local development, CI, and initial deployment baseline is PostgreSQL
  18.6. Later supported minor releases may replace it after normal dependency
  validation; a major-version change requires an explicit architecture review.
- PostgreSQL is the single system of record for relational domain state,
  authorization relationships, audit/domain events, package manifests, and job
  status.
- Drizzle ORM expresses the code-side schema; Drizzle Kit produces reviewed SQL
  migrations committed to `drizzle/`.
- Production schema changes use migrations, never direct schema push.
- Unit tests exercise pure domain/application logic without a database.
- Integration tests use an ephemeral real PostgreSQL database with migrations
  applied and a reset/transaction strategy that does not hide RLS behavior.
- Critical browser tests run against the same Postgres-backed application.

Slice 1A established the Postgres.js/Drizzle connection factory, a server-only
application singleton, validated runtime and migration URLs, an intentionally
initially empty schema entry point, and Drizzle generate/migrate commands. The runtime
smoke command executes `SELECT 1` and fails if PostgreSQL is unavailable. The
runtime URL and migration-owner URL are separate so later production roles can
keep ordinary application access distinct from schema ownership.

The local Slice 1A foundation was verified against PostgreSQL 18.6 on
2026-10-01 using separate runtime and migration roles. `pnpm db:check`,
`pnpm db:migrate`, and `pnpm test:db` passed with valid credentials and each
exited nonzero with a wrong password, without exposing passwords or connection
URLs. Database commands load `.env.local`, then `.env`, without replacing
existing process environment variables. `pnpm test` excludes external-service
integration tests; `pnpm test:db` is the explicit real-DB gate and fails when
`DATABASE_URL` is absent. At Slice 1A approval, `drizzle/` contained only an
empty journal and migration application created only bookkeeping. Slice 1B-1
now adds one reviewed auth migration. Local role privileges and the remaining
schema boundary are recorded in
[`docs/DATABASE.md`](DATABASE.md#slice-1a-foundation--implemented-local-validation).

The conceptual model and future schema constraints are defined in
[`docs/DATA_MODEL.md`](DATA_MODEL.md). The approved physical PostgreSQL table,
constraint, index, and RLS policy design is in
[`docs/DATABASE.md`](DATABASE.md). Only the four GLOBAL auth table definitions
and their migration exist. Production role provisioning, automated test-database
lifecycle, tenant/product tables, and RLS remain **NOT IMPLEMENTED**.

## Authentication and tenant model

On 2026-10-01, the greenfield authentication decision changed from Auth.js to
Better Auth. Auth.js v5 beta is not approved. The official
[Auth.js migration guidance](https://authjs.dev/getting-started/migrate-to-better-auth)
recommends Better Auth for new projects; no Auth.js code or tables had been
implemented, so this is a design revision, not a data migration.

The installed, exactly pinned direct dependencies are stable `better-auth@1.7.7` and
`@better-auth/drizzle-adapter@1.7.7`. Both registry versions were verified with
`pnpm view` on 2026-10-02. This supersedes the initial 1.7.6 selection:
the [1.7.7 release](https://github.com/better-auth/better-auth/releases/tag/v1.7.7)
fixes critical Magic Link account takeover and concurrent PostgreSQL requests
exceeding database-backed rate limits. This does not enable Magic Link or add
database rate-limit storage to 1B-1. Recheck stable registry versions before
installation; do not mix unmatched versions without checking compatibility.
The declared peer ranges cover the current Next.js 16.3.7,
React 19.3.0, Drizzle ORM 0.45.3, and Drizzle Kit 0.31.11. Frozen-lockfile
installation, type compatibility, official schema generation/check, and
runtime-role adapter/session integration were verified locally on 2026-10-02.

**Slice 1B-1 — IMPLEMENTED, local validation:** server-side persistence under `src/platform/auth/`
using the [official Drizzle adapter](https://better-auth.com/docs/adapters/drizzle)
with `provider: "pg"`, `schema`, and `usePlural: true` for the existing plural
table names, plus the existing runtime `DATABASE_URL`. Use the official
`advanced.database.generateId: "uuid"` strategy, not a custom ID generator.
PostgreSQL stores sessions; secondary storage, stateless/JWT sessions, and cookie caching
are not selected. Cookie caching stays disabled so expiry/revocation checks use
the database. The server boundary uses Better Auth's session API; any required
Next.js mount uses the official `toNextJsHandler`, not a public debug endpoint.
No sign-in method, fake provider, or signed-in product state is introduced.

Authentication requests require server-only `BETTER_AUTH_SECRET` (high entropy,
at least 32 characters) and an explicit `BETTER_AUTH_URL` to local/deployment
configuration, with safe placeholders in `.env.example`. Missing/invalid
configuration fails without disclosing values. The public shell/build does
not initialize auth; the auth route initializes it lazily and returns a generic
503 on invalid configuration. Next.js retains responsibility for
application environment loading; `local-env.ts` remains CLI/test-only.

The official `toNextJsHandler` mounts GET/POST under `/api/auth/[...all]`.
The pure factory accepts injected DB/config for official offline schema tooling
and real adapter tests; application credential access is in the `server-only`
entry point. Auth error logs preserve severity but discard SQL parameters and
raw error data. No production sign-in or test fixture endpoint is exposed.

Local validation proves adapter User/Account/Session/Verification persistence,
DB session lookup/expiry/revocation, atomic core verification consumption,
constraints, actual columns/indexes/ownership, and runtime DDL denial. This is
not a verified Magic Link flow or tenant authorization. Default `pnpm build`
(Turbopack) passed in the working tree and a fresh Windows snapshot on
2026-10-04, closing the local build gate without a webpack opt-out or repository
configuration change. Linux/CI execution remains unverified; the historical
native-SWC policy block and audit evidence are recorded in the
[active plan](plans/active/0001-mvp-foundation.md#slice-1b-1--better-auth-persistence-foundation).

Slice 1B-2 adds the [Magic Link plugin](https://better-auth.com/docs/plugins/magic-link),
transactional delivery through its `sendMagicLink` callback, and sign-in UI.
The email vendor/region remain **OPEN** and do not block 1B-1.

Conceptual identity model:

- `User`: authenticated person.
- `Tenant`: seller workspace and data-ownership boundary.
- `Membership`: User-to-Tenant relationship with one role.

Better Auth `User`, `Account`, `Session`, and `Verification` infrastructure is
GLOBAL rather than tenant-owned. `Tenant` is the TENANT_ROOT and has no
`tenant_id` of its own; `Membership` and every tenant-domain record are owned by
that root. Do not add `tenant_id` to Better Auth core tables as a substitute for
Membership authorization. Do not use Better Auth organization/multi-tenant,
admin/role, or other authorization plugins: Seller Shield's Tenant/Membership
model and PostgreSQL RLS remain the single tenant-authorization design for 1C.
The revised core table contract and pre-migration schema verification gate are
owned by [`docs/DATABASE.md`](DATABASE.md#global-better-auth-core-tables).

MVP roles:

- `OWNER`: workspace management and all MVP actions.
- `OPERATOR`: case, evidence, policy, and response-draft work.
- `REVIEWER`: review/approve packages and record submissions/outcomes.

One person may have multiple memberships. A session authenticates a user; it
does not authorize a tenant. Each request resolves membership server-side and
creates an `AccessContext` containing user, tenant, membership, and role.

Every tenant-owned operation runs in a transaction-scoped tenant context with
PostgreSQL Row-Level Security and tenant-aware relationships. The application
database role cannot bypass RLS; migrations use a separate owner role. Service
authorization and composite tenant constraints remain in place because RLS is
defense in depth, not a reason to omit application checks.

See [ADR-002](adr/0002-tenant-isolation.md).

## Evidence storage and integrity — DECIDED, NOT IMPLEMENTED

Use private S3-compatible object storage. PostgreSQL stores metadata,
relationships, state, and audit events; object storage holds bytes.

### Upload and access

- A server-authorized initiation creates a unique staging key and pending
  evidence record.
- The client receives a short-lived presigned `PUT` limited to the staging key,
  expected size/content constraints, and checksum where supported.
- Finalization checks storage metadata/checksum, then promotes the staging
  object server-side to a new unique final key before marking it available.
- Only the final object/version is recorded as original evidence; an upload URL
  is never issued for that final key.
- Downloads require a fresh tenant/role authorization and return a short-lived
  presigned `GET`; evidence URLs are never public or durable identifiers.
- Signed URLs are excluded from application logs and analytics.

### Original and derived objects

- An original object uses a unique key and is never overwritten.
- Metadata corrections and logical deletion are separate audited changes.
- Derived objects use separate keys and records linked to originals.
- Approved packages store an immutable evidence manifest containing the
  selected IDs, versions, and digests.
- Retention/deletion rules can mark an artifact unavailable without silently
  changing the historical package manifest.

### Content digest

Record SHA-256 for original evidence. Prefer provider-verified checksums; use a
trusted worker to stream and hash the stored object when the provider cannot
provide the required semantics.

The digest proves only that compared bytes match the captured bytes. It does
not prove authenticity, factual truth, source identity, capture time, or that
the material was unmodified before collection.

The storage vendor, bucket region, provisional retention duration, and deletion
schedule remain **OPEN**. See
[ADR-003](adr/0003-evidence-storage-and-integrity.md).

## AI boundary — DECIDED, NOT IMPLEMENTED

Manual response drafting is the primary path. Creating, reviewing, approving,
and exporting a `ResponsePackage` must work with no configured or available
LLM.

Optional AI assistance uses one narrow application port such as
`ResponseAssistant.suggestDraft(input)`. A provider adapter under
`src/platform/ai/` maps the provider response to a Zod-validated internal
result.

- Send only explicitly selected, authorized case material.
- Treat evidence, policy, customer, and marketplace text as untrusted data, not
  model instructions.
- Give the model no autonomous tools, storage access, or network access.
- Verify every returned evidence/policy reference server-side against the
  tenant, case, and supplied input set.
- Preserve `SUPPORTED`, `CONFLICTING`, `MISSING`, `UNVERIFIED`, and `INFERENCE`
  distinctions.
- Store provider/model/prompt version and attempt result without placing PII or
  secrets in logs.
- Failure leaves the manual/last valid draft intact and never advances state.

The concrete LLM provider/model remains **OPEN** pending privacy, region,
retention, training-use, structured-output, cost, and reliability review. No
general agent framework, vector database, RAG system, or fine-tuning is part of
MVP v0.1.

See [ADR-004](adr/0004-manual-first-ai-boundary.md).

## Policy references — DECIDED, NOT IMPLEMENTED

P0 policy capture is manual and point-in-time reproducible. Each reference used
by a case preserves:

- marketplace and source URL,
- retrieval time,
- known effective date/published version when available,
- captured text used by the reviewer,
- an optional original page/document snapshot,
- capture method and actor,
- and SHA-256 over the captured representation.

The response-package manifest records the exact policy-reference version and
digest. Re-fetching a changed URL creates a new version and never mutates the
historical capture. A hash detects byte changes; it does not prove official
status, completeness, effectiveness, legal meaning, or correct interpretation.

No crawler, policy RAG, or automatic applicability decision is included in P0.
See [ADR-006](adr/0006-policy-reference-reproducibility.md).

## Response package and export — DECIDED, NOT IMPLEMENTED

Internal domain terms are `ResponseDraft`, `ResponsePackage`, `Submission`, and
`Outcome`. Marketplace adapters may present platform-specific labels such as
appeal, explanation, objection, or dispute response.

An approved package freezes an immutable manifest of:

- response-draft version,
- evidence IDs/versions/digests,
- policy-reference version/digest,
- uncertainty/support state,
- reviewer and approval time,
- template version.

P0 renders one PDF from a versioned HTML/CSS template using pinned headless
Chromium through Playwright. Bundle Korean fonts with the application. The job
is keyed by package/template version, retryable, and stores the output as a
private derived object.

P0 does not generate a ZIP of original evidence. Originals remain separately
available through authorized downloads. Add a PDF+ZIP option only when real
seller or marketplace workflows validate the need.

See [ADR-005](adr/0005-html-to-pdf-export.md).

## Deployment topology — DECIDED SHAPE, OPEN PROVIDERS

```text
Browser
  │ HTTPS
  ▼
Containerized Next.js application
  ├── Managed PostgreSQL
  ├── Private S3-compatible object storage
  ├── Transactional email provider
  ├── Optional LLM provider
  └── Error-reporting provider

Same-image worker (introduced only when Slice 4/5 runtime requires it)
  ├── Managed PostgreSQL job table
  └── Private object storage / LLM / Chromium
```

Hosting vendor, region, managed PostgreSQL vendor, S3-compatible vendor, email
provider, and error-reporting provider remain **OPEN**. They must be chosen
together with Korean customer-data location, processor terms, backup, and
deletion requirements before real production data is accepted.

Use one production application service. The worker is a second process of the
same image, not a separate microservice or codebase.

## Observability — DECIDED, NOT IMPLEMENTED

- JSON structured application logs with timestamp, severity, service/process,
  environment, request/correlation ID, and safe route/error fields.
- Do not log evidence content, policy captures, response text, secrets, signed
  URLs, session tokens, or unnecessary customer identifiers.
- Generate or propagate a request ID at the application boundary and copy it to
  job attempts and external-provider calls.
- Use a minimal hosted error-reporting provider; vendor remains open.
- Store security/case audit events in PostgreSQL with actor, tenant, action,
  target, time, and relevant version identifiers.
- Metrics derive from attributable events; do not create a separate analytics
  warehouse in MVP.

## Module boundaries

| Module | Responsibility | May depend on | Must not contain |
| --- | --- | --- | --- |
| `identity` | User, Tenant, Membership, roles, AccessContext | Auth/DB ports | Case rules, evidence bytes, provider SDKs |
| `cases` | Claim intake, lifecycle, closure, timeline | `identity`, audit port | Storage SDK, LLM prompts, export rendering |
| `evidence` | Evidence metadata, provenance, readiness, original/derived links | `identity`, `cases`, storage port | Policy interpretation, response wording, public URLs |
| `policies` | Point-in-time policy references and digests | `identity`, `cases`, storage/digest ports | Crawling in P0, legal conclusions, response drafts |
| `responses` | Manual/AI-assisted drafts, support labels, package approval, submission record | `identity`, `cases`, `evidence`, `policies`, optional AI port | Provider SDKs, PDF implementation, marketplace auto-submit |
| `exports` | Immutable package manifest consumption, PDF jobs/artifacts | `identity`, `responses`, storage/PDF ports | Editing drafts, approving packages, changing case evidence |
| `outcomes` | Seller-entered results and validation events | `identity`, `cases`, `responses` | Buyer reputation, outcome prediction, cross-tenant benchmarks |

Dependency direction is UI/HTTP adapters → application services → domain rules
→ narrow ports. Platform adapters implement ports and cannot become a second
source of domain behavior.

## End-to-end data flows

Every flow begins with the same **AUTHZ boundary**: validate the server-side
session, resolve Membership for the requested Tenant, check the role, then open
a tenant-scoped RLS transaction. Object/provider actions occur only after this
boundary and are rechecked on finalize/read.

### Case creation

1. Server Action validates input with Zod.
2. **AUTHZ:** `OPERATOR` or `OWNER` membership is resolved.
3. `cases` stores original claim input separately from normalized values.
4. A case-created audit/domain event is recorded in the same transaction.
5. The Server Component reads through the same tenant context.

### Evidence upload

1. Upload initiation validates category, size, and media constraints.
2. **AUTHZ:** tenant/case access is checked; a pending evidence record and unique
   staging key are created.
3. Storage adapter issues a short-lived presigned PUT with checksum constraints.
4. Browser uploads directly to private storage.
5. Finalize request repeats **AUTHZ**, checks object metadata/checksum, promotes
   to a new final key, and records that immutable original/version; a worker
   hashes it if required.
6. Downloads repeat **AUTHZ** before issuing a short-lived presigned GET.

### Readiness review

1. **AUTHZ:** operator/reviewer access is checked.
2. `evidence` loads only tenant/case-scoped evidence, gaps, conflicts, and policy
   references.
3. Rules/AI may suggest readiness, but a human confirms `REVIEWABLE`.
4. `cases` applies the allowed transition and records actor/time.

### Manual response draft

1. **AUTHZ:** `OPERATOR`, `REVIEWER`, or `OWNER` access is checked.
2. `responses` creates a `MANUAL` draft linked to selected evidence/policy.
3. Human edits create attributable versions; no LLM/provider call occurs.
4. The draft remains reviewable even during provider outages.

### AI-assisted response draft

1. The manual flow's **AUTHZ** and selected-source checks run first.
2. A job/attempt stores tenant, case, selected references, and prompt version.
3. Provider adapter receives minimized, delimited untrusted content.
4. Zod validates output; server verifies every returned reference.
5. Valid suggestions create an `AI_ASSISTED` draft version; failure preserves
   the prior draft and case state.

### Human approval

1. **AUTHZ:** `REVIEWER` or `OWNER` role is required.
2. `responses` verifies support/uncertainty and current source references.
3. Approval freezes the package manifest and records reviewer/time atomically.
4. Only this action transitions the case to `PACKAGE_READY`.

### Package export

1. **AUTHZ:** package access is checked and an idempotent export job is created.
2. `exports` loads the immutable approved manifest, never mutable live draft
   state.
3. Playwright renders the versioned HTML/CSS template to PDF.
4. Storage adapter writes a private derived artifact and records digest/status.
5. Retry uses the same idempotency key; failure does not change package state.

### External submission recording

1. Human submits outside Seller Shield.
2. **AUTHZ:** `REVIEWER` or `OWNER` records destination, external reference/time
   when known, and actor.
3. `responses` transitions `PACKAGE_READY` to `SUBMITTED`; no external submit
   API is called in P0.

### Outcome recording

1. **AUTHZ:** authorized operator/reviewer records a seller-entered outcome.
2. `outcomes` labels its source and stores notes/reference when known.
3. `cases` transitions `SUBMITTED` to `RESOLVED` atomically with an audit event.
4. Product metrics retain tenant privacy and do not imply platform verification.

## Threat-oriented architecture review

| Risk | Architectural mitigation | Remaining concern |
| --- | --- | --- |
| Cross-tenant access / IDOR | Server membership/role checks, tenant transaction context, RLS, tenant-aware constraints, negative integration tests | RLS bypass or missing transaction context must fail closed and be tested. |
| Insecure object access | Private bucket, authorized short-lived signed URLs, unique keys, finalize checks | A leaked URL remains usable until expiry; keep expiry short and out of logs. |
| Leaked signed URLs | Redaction, no analytics/log capture, narrow object/method/expiry | Cannot revoke every provider URL instantly without an intermediary. |
| Reused upload URL overwrites bytes | Upload URL targets staging only; authorized finalize promotes to a different unique final key | Abandoned staging objects need automated expiry cleanup. |
| Malicious upload / file-type spoofing | Size/type allowlists, declared-type and magic-byte checks, quarantine before finalization, no active-content inline rendering, and safe derived previews | Malware inspection capability is provider-specific and remains an operational decision before real evidence is accepted. |
| Prompt injection in uploaded/customer content | Treat as delimited untrusted data, no model tools/network, minimize inputs, validate output | A model can still produce misleading text; human review remains mandatory. |
| Hallucinated evidence references | Server validates reference IDs against tenant/case/supplied set | Semantically wrong but valid citations still require human review. |
| Policy-source drift | Point-in-time capture, retrieval/effective context, digest, immutable version references | Capture does not prove official/legal applicability. |
| Unlogged policy changes | Policy content is versioned instead of overwritten; each capture records source, retrieval/effective context, actor/method, digest, and an audit event | Manual capture can still be wrong; source review remains a human responsibility. |
| Unauthorized export | Package-level tenant/role authorization, RLS, tenant context in export jobs, immutable manifests, and short-lived authorized downloads | Worker identity and signed-download expiry require deployment-specific tests. |
| Sensitive data leakage through logs, providers, or downloads | Structured allowlist logging, centralized redaction, minimum necessary provider input, private objects, and signed-URL redaction | Every selected provider and its data terms still require review. |
| Secret exposure | Server-only secret facility, no client/log/export/prompt inclusion, scoped credentials | Provider dashboards and CI configuration require separate operational controls. |
| Deleted evidence referenced by package | Immutable manifest/digests and explicit unavailable state; retention check before deletion | Legal retention requirements remain open. |
| Export race/retry | Package/version idempotency key, job state, immutable manifest, atomic completion | Stale jobs need recovery rules when worker is introduced. |
| Automatic external submission without human review | P0 records a human-performed external submission but has no auto-submit connector or marketplace credential path | Any future connector requires a separate decision and must preserve explicit human approval before submission. |

## Architecture decision records

- [ADR-001: Single Next.js application](adr/0001-single-nextjs-application.md)
- [ADR-002: Tenant isolation and authorization](adr/0002-tenant-isolation.md)
- [ADR-003: Evidence storage and integrity](adr/0003-evidence-storage-and-integrity.md)
- [ADR-004: Manual-first AI boundary](adr/0004-manual-first-ai-boundary.md)
- [ADR-005: HTML-to-PDF response export](adr/0005-html-to-pdf-export.md)
- [ADR-006: Point-in-time policy reference reproducibility](adr/0006-policy-reference-reproducibility.md)

## Source-of-truth locations

- Product behavior and MVP scope: `docs/PRODUCT.md`
- Claim, evidence, policy, and response semantics: `docs/domain/`
- Aggregate boundaries, entity relationships, and lifecycle invariants:
  `docs/DATA_MODEL.md`
- Physical tables, constraints, indexes, scope classification, and RLS policy
  intent: `docs/DATABASE.md`
- Security/privacy requirements and control status: `docs/SECURITY.md`
- Architecture decisions and boundaries: this document and `docs/adr/`
- Slice sequence and remaining provider decisions:
  `docs/plans/active/0001-mvp-foundation.md`
- Current implementation: application code and configuration in this repository

When implementation begins, update **NOT IMPLEMENTED** claims only after the
relevant code and validation exist.
