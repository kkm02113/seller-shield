# ADR-005: HTML-to-PDF response export

- **Status:** Accepted
- **Implementation:** NOT IMPLEMENTED

## Context

The MVP needs a stable, human-readable export linked to an approved response
package. Korean typography, repeated rendering, retry safety, and testability
matter. Marketplace requirements for ZIP bundles are not yet validated.

## Decision

Render one PDF from a versioned HTML/CSS template using pinned headless Chromium
through Playwright.

- The approved `ResponsePackage` stores an immutable manifest of draft,
  evidence, policy, reviewer, and template versions.
- The renderer consumes only that manifest, not mutable live case state.
- Bundle Korean fonts with the application and pin Chromium/template versions.
- Use an idempotency key derived from package version and template version.
- Store the generated PDF as a derived private object linked to the package.
- A failed job is retryable and never changes package approval or submission
  state.
- P0 exports one PDF. Original evidence remains separately accessible through
  authorized downloads; PDF+ZIP bundling is deferred until real marketplace or
  seller workflows require it.

Export generation uses a PostgreSQL-backed job record. It may run inline under
a bounded container request initially; introduce a same-image worker process
when observed runtime or hosting limits require durable background execution.
No Redis or external queue is introduced.

## Consequences

- Container deployment must support pinned Chromium and bundled fonts.
- PDF snapshot/fixture tests cover content, page count, and stable extracted
  text; exact binary identity is not required across every platform.
- A later ZIP option can reuse the immutable package manifest without changing
  approval semantics.

## References

- <https://playwright.dev/docs/api/class-page#page-pdf>
