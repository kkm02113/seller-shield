# Seller Shield repository instructions

This file is a short router for work in this repository. Durable product,
domain, architecture, and security knowledge belongs under `docs/`.

## Repository behavior

- Make the smallest change that satisfies the requested task.
- Do not modify unrelated files.
- Preserve the existing architecture unless the task requires a change.
- Treat the repository contents as the authority for what is implemented.
- Report uncertainty instead of inventing project facts or evidence.
- Do not commit or push unless explicitly requested.
- Do not install or change dependencies unless the task requires it.
- Never silently weaken tests, validation, security checks, authorization,
  privacy controls, or type safety to make a task pass.
- Verify affected behavior before declaring completion.
- Keep temporary implementation notes out of repository-wide instructions.
- Put durable knowledge in the narrowest relevant document and link to it
  instead of duplicating it elsewhere.

## Documentation routing

Read only the documents relevant to the task. Do not preload the entire
documentation tree. Routing is cumulative when a task spans concerns, but use
the smallest set of matching documents.

- Repository documentation index and ownership
  -> `docs/README.md`
- Product purpose, boundaries, workflow, or MVP behavior
  -> `docs/PRODUCT.md`
- Application boundaries, dependencies, API/schema ownership, storage or
  integration boundaries, or source-of-truth changes
  -> `docs/ARCHITECTURE.md`
- Aggregate boundaries, entity relationships, and lifecycle invariants
  -> `docs/DATA_MODEL.md`
- Physical schema, migrations, database constraints, indexes, table scope, or
  RLS policy design
  -> `docs/DATABASE.md` and `docs/ARCHITECTURE.md`; also read
     `docs/DATA_MODEL.md` for domain invariants and `docs/SECURITY.md` when
     tenant, authorization, privacy, retention, or deletion is affected
- Authentication, authorization, PII, tenant isolation, evidence access,
  audit, retention, deletion, secrets, or AI data handling
  -> `docs/SECURITY.md`
- Claim meaning or case semantics
  -> `docs/domain/claims.md`
- Evidence meaning, collection, provenance, or verification
  -> `docs/domain/evidence.md`
- Evidence access, integrity, privacy, or tenant-boundary changes
  -> `docs/domain/evidence.md` and `docs/SECURITY.md`
- Evidence storage or provider-boundary changes
  -> `docs/domain/evidence.md` and `docs/ARCHITECTURE.md`
- Marketplace policy or policy-version semantics
  -> `docs/domain/policies.md`
- Response drafts/packages, human review, submission, or outcomes
  -> `docs/domain/responses.md`
- Preparing a new Codex implementation task
  -> `docs/codex/TASK_TEMPLATE.md`
- Reviewing a change
  -> `docs/codex/REVIEW_TEMPLATE.md`
- Complex multi-step implementation
  -> the relevant active plan under `docs/plans/active/`

If future backend, frontend, or integration documents are added, route
tasks to them only after the paths exist. Do not create nested `AGENTS.md`
files unless a subtree has durable rules that apply to most work there,
materially differ from these rules, and cannot be expressed through routed
documentation.

## Documentation maintenance

- Update documentation when externally visible behavior, architecture, API,
  schema, security posture, or other durable project knowledge changes.
- Clearly distinguish `CURRENT`, `PLANNED`, and `UNKNOWN` where implementation
  status is not self-evident.
- Do not present a plan, assumption, or TODO as implemented behavior.
- Prefer links to authoritative files over repeated rules.
- Keep Codex workflow instructions under `docs/codex/`, separate from product
  and domain documentation.
- Do not let README files compete with `docs/` as a second product source of
  truth; README files should orient and link.

## Definition of done

A normal implementation task is complete when:

1. The requested behavior is implemented.
2. Relevant acceptance criteria are satisfied.
3. Affected tests and checks pass.
4. Unrelated behavior has not been intentionally changed.
5. Documentation is updated when externally visible behavior, architecture,
   API, schema, security posture, or durable project knowledge changed.
6. Remaining risks, uncertainties, and unverified assumptions are explicitly
   reported.
