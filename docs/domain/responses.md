# Responses, submissions, and outcomes

This document defines marketplace-neutral internal terms. Marketplace adapters
may present a response as an appeal, explanation, objection, dispute response,
or another platform-specific label, but those labels do not rename the core
domain objects.

## Response draft

A `ResponseDraft` is editable seller-side response text assembled from case
facts, traceable evidence, an attributable policy basis, and case analysis. It
must not add unsupported facts or present AI output as evidence.

A response draft may be written entirely by a human or created with AI
assistance. LLM availability must not be required to create or edit it.

## Response package

A `ResponsePackage` is a human-approved, versioned package prepared for
external use. It identifies the response draft version, evidence references,
policy basis, reviewer, and approval time. It is not the same as a submission.

Approval creates an immutable `PackageManifest` containing both live reference
identities and the snapshot metadata/digests required to reproduce that package.
Later edits to the Case, draft, Evidence metadata, or policy reference cannot
mutate an approved package; material changes require another package version.
Full binary reconstruction is guaranteed only while referenced Artifact bytes
remain retained. After permitted physical deletion, the manifest, digests, and
deletion tombstones remain auditable and must report that binary reconstruction
is unavailable.
See [`docs/DATA_MODEL.md`](../DATA_MODEL.md) for the model boundary.

## Human review

Under the current product boundary, a human must review and approve the
response package before it can be finalized for external use. Review must make
supporting evidence, policy basis, uncertainties, and generated content
inspectable.

## Submission

A `Submission` records the externally directed action performed after approval.
The actor, approval, package version, evidence references, policy basis,
destination, and time should be attributable in the future implementation.

One package may have multiple actual submission attempts. A correction to a
recorded attempt creates an append-only revision rather than rewriting the
original record.

No submission channel, marketplace integration, retry rule, idempotency model,
or submission status lifecycle is currently implemented.

## Outcome

An `Outcome` records what happened after a reviewed case or submission. Outcome
tracking remains tied to the case and must not become a shared buyer reputation
system.

Outcome corrections form an append-only revision chain so the current
seller-entered result is visible without erasing the original entry.

No automated marketplace outcome retrieval is implemented. Seller-entered
outcomes remain distinguishable from independently verified platform data.

## Invariants

- Packages use traceable evidence and a reproducible policy basis.
- Manual drafting remains available when AI is unavailable or disabled.
- Drafting, human approval, external submission, and outcome recording remain
  distinguishable events.
- Unsupported claims and unresolved uncertainty remain visible for review.
- External submission requires human approval unless an explicitly approved
  future feature changes that rule.
