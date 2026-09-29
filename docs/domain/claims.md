# Claims

This document defines MVP v0.1 domain decisions. It does not claim that a case
model or lifecycle is implemented.

## Meaning

A claim is the case being reviewed in Seller Shield: a return, refund, or
related marketplace dispute that may require evidence collection, policy
matching, analysis, and a seller response.

A claim is a case record, not a representation of a buyer's character or
reputation. Analysis must remain scoped to the facts and policy relevant to
that case.

## Relationships

A claim may provide the context that links:

- source evidence and verified or derived material,
- the applicable marketplace policy version,
- case analysis,
- a response package,
- a human-reviewed submission,
- and a recorded outcome.

This is a domain relationship, not a confirmed database schema.

## Invariants

- A claim must not assert facts that are unsupported by traceable evidence.
- A normal legitimate return must remain a valid outcome of review; the system
  must not presume every claim requires defense.
- Claim data belongs to a tenant context and must not be exposed across tenant
  boundaries.
- Claim analysis must not create a buyer blacklist or shared reputation record.

## State and lifecycle

The MVP uses the smallest lifecycle that separates collection, review, package
approval, external submission, and outcome. A state describes workflow
progress; it is not a buyer or fraud classification.

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
