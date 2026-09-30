# Cases and claims

This document defines MVP v0.1 Case and source-claim semantics. It does not
claim that a model or lifecycle is implemented.

## Meaning

A `Case` is Seller Shield's workflow container for reviewing a return, refund,
or related marketplace dispute. It owns workflow state and coordinates
evidence collection, policy matching, response preparation, submission
recording, and outcome recording.

A `ClaimSnapshot` is an immutable capture of the external marketplace/customer
claim or a later source revision. A Case may have multiple ordered snapshots;
normalized working values never overwrite their original source values. The
detailed aggregate boundary is defined in
[`docs/DATA_MODEL.md`](../DATA_MODEL.md).

Neither a Case nor a ClaimSnapshot represents a buyer's character or
reputation. Analysis remains scoped to the facts and policy relevant to the
Case.

## Relationships

A Case provides the context that links:

- one or more source ClaimSnapshots,
- source evidence and verified or derived material,
- the applicable marketplace policy version,
- case analysis,
- a response package,
- a human-reviewed submission,
- and a recorded outcome.

This is a domain relationship, not a confirmed database schema.

## Invariants

- A Case must not present facts as established when they are unsupported by
  traceable evidence.
- A normal legitimate return must remain a valid outcome of review; the system
  must not presume every Case requires defense.
- Case and ClaimSnapshot data belongs to a tenant context and must not be
  exposed across tenant boundaries.
- Case analysis must not create a buyer blacklist or shared reputation record.

## State and lifecycle

The Case uses the smallest lifecycle that separates collection, review,
package approval, external submission, and outcome. A state describes workflow
progress; it is not a buyer or fraud classification. This table is the only
authoritative MVP Case state machine.

| State | Meaning |
| --- | --- |
| `DRAFT` | The case exists, but source claim context is still being captured. |
| `GATHERING_EVIDENCE` | The case is understood well enough to identify evidence gaps, but is not ready for a review decision. |
| `READY_FOR_REVIEW` | A human has confirmed that the available evidence is sufficient to decide whether to prepare a response or close the case. |
| `PACKAGE_READY` | A human has reviewed and approved a specific response-package version for external use. |
| `SUBMITTED` | A human has recorded that the package was submitted outside Seller Shield. |
| `RESOLVED` | A human has recorded the external result. This is terminal. |
| `CLOSED` | A human ended the case without an active submitted response. This is terminal. |

Evidence being `READY_FOR_REVIEW` does not imply that a response is warranted.
A legitimate return can proceed from `READY_FOR_REVIEW` to `CLOSED`.

## Allowed transitions

| From | To | Trigger |
| --- | --- | --- |
| New case | `DRAFT` | A human creates a case; a future connector may create a draft but is not part of MVP P0. |
| `DRAFT` | `GATHERING_EVIDENCE` | A human confirms enough source context to begin evidence review. |
| `DRAFT` | `CLOSED` | A human marks a duplicate, mistaken entry, or withdrawn case. |
| `GATHERING_EVIDENCE` | `READY_FOR_REVIEW` | A human confirms the evidence readiness assessment. |
| `GATHERING_EVIDENCE` | `CLOSED` | A human decides not to continue, with a closure reason. |
| `READY_FOR_REVIEW` | `GATHERING_EVIDENCE` | A human reopens collection because a material gap or conflict remains. |
| `READY_FOR_REVIEW` | `PACKAGE_READY` | A human approves a response-package version after reviewing evidence, policy references, draft assertions, and uncertainty. |
| `READY_FOR_REVIEW` | `CLOSED` | A human decides the return is legitimate, the case is not disputable, or a response is not worthwhile. |
| `PACKAGE_READY` | `READY_FOR_REVIEW` | A human reopens the package for material edits. |
| `PACKAGE_READY` | `SUBMITTED` | A human records an external submission; Seller Shield does not submit autonomously. |
| `PACKAGE_READY` | `CLOSED` | A human cancels the approved package before submission. |
| `SUBMITTED` | `RESOLVED` | A human records the external outcome. |

No automated process may move a case to `PACKAGE_READY`, `SUBMITTED`,
`RESOLVED`, or `CLOSED` in MVP v0.1. Automated analysis may suggest a next
state, but a tenant-authorized human triggers the transition. Every transition
must be attributable and tenant-scoped.

## Terminal dispositions

`CLOSED` records one of these minimum reasons:

- `LEGITIMATE_RETURN`
- `NOT_DISPUTABLE`
- `INSUFFICIENT_EVIDENCE`
- `DUPLICATE`
- `WITHDRAWN`
- `OTHER`

`RESOLVED` records one of these seller-entered outcomes:

- `SELLER_FAVORABLE`
- `SELLER_UNFAVORABLE`
- `PARTIAL`
- `NO_DECISION`
- `OTHER`

Free-form notes may add context, but they do not replace the source evidence or
turn a seller-entered outcome into independently verified marketplace data.
