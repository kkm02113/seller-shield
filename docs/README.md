# Seller Shield documentation

The `docs/` directory is the source of truth for durable repository knowledge.
The root `AGENTS.md` routes a task to only the documents it needs.

## Product and system

- [Product](PRODUCT.md): purpose, users, boundaries, workflow, and MVP scope.
- [Architecture](ARCHITECTURE.md): confirmed repository and application
  boundaries, plus explicitly separated plans and unknowns.
- [Domain and data model](DATA_MODEL.md): aggregate boundaries, relationships,
  lifecycle invariants, and tenant ownership semantics.
- [Physical database schema](DATABASE.md): proposed PostgreSQL tables, keys,
  constraints, indexes, RLS policy intent, and migration-slice boundaries.
- [Security](SECURITY.md): durable privacy, isolation, evidence, and AI-data
  requirements, with implementation status called out.

## Domain

- [Cases and claims](domain/claims.md)
- [Evidence](domain/evidence.md)
- [Policies](domain/policies.md)
- [Responses, submissions, and outcomes](domain/responses.md)

## Codex workflow

- [Task template](codex/TASK_TEMPLATE.md)
- [Review template](codex/REVIEW_TEMPLATE.md)

## Active plans

- [MVP foundation](plans/active/0001-mvp-foundation.md)

## Architecture decisions

- [ADR-001: Single Next.js application](adr/0001-single-nextjs-application.md)
- [ADR-002: Tenant isolation and authorization](adr/0002-tenant-isolation.md)
- [ADR-003: Evidence storage and integrity](adr/0003-evidence-storage-and-integrity.md)
- [ADR-004: Manual-first AI boundary](adr/0004-manual-first-ai-boundary.md)
- [ADR-005: HTML-to-PDF response export](adr/0005-html-to-pdf-export.md)
- [ADR-006: Policy reference reproducibility](adr/0006-policy-reference-reproducibility.md)

Backend, frontend, and integration documents should be added only when the
repository contains the corresponding code or an approved plan needs a durable
home. Empty placeholder hierarchies are intentionally omitted.

## Documentation ownership

Use the narrowest authoritative document:

- Product decisions belong in `PRODUCT.md` or a relevant domain document.
- Implemented system structure belongs in `ARCHITECTURE.md`.
- Aggregate boundaries, entity relationships, and lifecycle invariants belong
  in `DATA_MODEL.md`.
- Physical table shape, constraints, indexes, and RLS policy intent belong in
  `DATABASE.md`.
- Durable security requirements and confirmed controls belong in `SECURITY.md`.
- Task-specific deltas belong in task prompts or active plans, not global docs.

When code and documentation disagree about current implementation, inspect the
code and configuration, report the mismatch, and update the documentation as
part of the relevant change. Do not infer implementation from a plan.
