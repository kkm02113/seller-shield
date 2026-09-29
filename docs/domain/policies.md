# Policies and policy versions

## Meaning

A policy is an attributable marketplace rule used to evaluate a claim. A
policy version identifies the rule text or interpretation applicable at a
particular effective point or source revision.

## Invariants

- Policy material must be attributable to its source.
- A case decision or response package must identify the policy basis it uses.
- Updating policy material must not silently change the historical basis of an
  existing analysis or submission.
- Uncertain applicability, missing effective dates, and unavailable source
  material must be reported instead of guessed.
- Generated summaries or interpretations must remain distinguishable from the
  sourced policy material.

## Matching

Policy matching connects claim facts and verified evidence to a relevant
policy version. Matching is not itself proof that a claim should be disputed,
and it must allow the conclusion that an ordinary return is legitimate.

## Point-in-time reproducibility

A policy basis used for a case must remain reconstructable even if the source
page later changes. The conceptual reference therefore preserves:

- marketplace and source URL,
- retrieval time,
- effective date or published version when the source provides one,
- captured text or a point-in-time snapshot used for the case,
- and a content digest such as SHA-256 for the captured representation.

The digest can show whether the captured bytes later changed relative to the
recorded digest. It does not prove that the source was authentic, complete,
legally controlling, or correctly interpreted. Exact database columns and
snapshot storage are architecture and data-model decisions.

## Unknowns

No automated ingestion method, refresh schedule, or marketplace-specific
citation format is currently confirmed. These require explicit architecture
decisions and implementation evidence.
