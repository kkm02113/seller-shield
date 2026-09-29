# ADR-001: Single Next.js application

- **Status:** Accepted
- **Implementation:** NOT IMPLEMENTED

## Context

Seller Shield has no application code and needs one small team to deliver UI,
server-side authorization, case workflows, evidence access, optional AI, and
export without operating two application runtimes. A separate Next.js frontend
and FastAPI backend would add deployments, contracts, tracing, and duplicated
validation before a Python-only workload exists.

## Decision

Use one TypeScript Next.js App Router application running on the Node.js
runtime in a container.

- Server Components perform authenticated reads directly through application
  services.
- Server Actions handle UI-originated mutations.
- Route Handlers handle uploads, downloads, health checks, and machine-facing
  HTTP boundaries.
- Client Components are limited to interactive forms, upload progress, and
  draft editing.
- Zod validates external input and structured provider output.
- PostgreSQL is accessed through Drizzle ORM; reviewed SQL migrations are
  generated/applied with Drizzle Kit.
- Vitest covers domain/application tests, React Testing Library covers focused
  UI behavior, and Playwright covers critical browser flows.
- A worker entry point may be added from the same package and image only when
  Slice 4/5 introduces durable long-running jobs.

The repository remains a single package until independently deployable code or
genuinely shared packages exist.

## Consequences

- Local development, types, validation, and deployment stay in one runtime.
- Domain modules must remain independent of Next.js request objects so they can
  be tested and called by a later worker.
- A future service split requires evidence from workload or team boundaries,
  not speculative scale.
- Headless Chromium support makes a container deployment preferable to a
  static export or constrained edge runtime.

## Alternatives rejected for MVP

- **Next.js + FastAPI monorepo:** useful if Python-only processing becomes
  material, but presently creates two runtimes without product value.
- **FastAPI with server-rendered UI:** operationally small, but less suitable
  for the interactive evidence and response-review interface.
- **Microservices:** no validated scale or ownership boundary justifies them.

## References

- <https://nextjs.org/docs/app>
- <https://nextjs.org/docs/app/guides/backend-for-frontend>
- <https://orm.drizzle.team/docs/migrations>
