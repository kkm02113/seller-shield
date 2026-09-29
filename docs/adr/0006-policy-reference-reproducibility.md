# ADR-006: Point-in-time policy reference reproducibility

- **Status:** Accepted
- **Implementation:** NOT IMPLEMENTED

## Context

A marketplace policy page can change after a case. Storing only its URL cannot
reconstruct the basis a reviewer used for an earlier response package.

## Decision

Every policy reference used by a case preserves a point-in-time captured
representation with:

- marketplace,
- source URL,
- retrieval time,
- known effective date or published version when available,
- captured text used for review,
- an optional original page/document snapshot when available,
- capture method and actor,
- and SHA-256 over the captured representation.

The response package manifest identifies the exact policy-reference version
and digest it used. Re-fetching the live URL may create a new policy-reference
version but never mutates the historical capture.

P0 capture is manual. Automated crawling, legal applicability decisions, and a
policy RAG/index are out of scope.

The digest can detect byte changes relative to the stored capture. It does not
prove the policy was official, complete, effective, legally controlling, or
correctly interpreted.

## Consequences

- Captured text is searchable and reviewable; larger original snapshots can use
  the same private object-storage boundary as evidence with a distinct policy
  type.
- The UI must show source, retrieval/effective context, capture status, and
  digest rather than presenting a URL as timeless truth.
- Marketplace adapters may later define capture formatting, but cannot weaken
  the point-in-time invariant.
