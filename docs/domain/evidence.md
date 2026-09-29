# Evidence

This document defines the conceptual MVP v0.1 evidence model. It does not
define database columns, storage technology, or implemented controls.

## Meaning

Evidence is source material relevant to a claim. It is distinct from a summary,
normalization, verification result, case analysis, or AI-generated statement.

## Conceptual categories

An evidence item has a domain category separate from its file or media format.
For example, a seller-provided photo or video may be condition evidence; image
and video are media types, not proof of what the content shows.

| Category | Examples and boundary |
| --- | --- |
| `CLAIM_SOURCE` | Original marketplace notice, return reason, refund request, or claim message. |
| `ORDER` | Order record, purchased option, quantity, or transaction reference. |
| `SHIPMENT` | Carrier record, tracking event, delivery confirmation, or dispatch record. |
| `PRODUCT_IDENTITY` | Serial number, model, option, label, packaging identifier, or other item identity material. |
| `CONDITION_MEDIA` | Seller-provided or return-inspection image/video showing condition; the observation remains separate from interpretation. |
| `RETURN_INSPECTION` | Attributable inspection notes, checklist, measurements, or received-item findings. |
| `CUSTOMER_SERVICE` | Relevant seller-buyer or marketplace communication and support history. |
| `MARKETPLACE_POLICY` | Attributable policy source and version used for review; detailed semantics remain in `docs/domain/policies.md`. |
| `EXTERNAL_DOCUMENT` | Other attributable material that does not fit the categories above. |

The category list is intentionally narrow. New categories require a recurring
case need; they must not be added solely for a single file format.

## Invariants

- Raw evidence remains traceable to its source.
- The original form must remain distinguishable from transformed or derived
  representations.
- Verification records what was checked and the result; it does not silently
  rewrite the source.
- Analysis and generated text must cite or otherwise reference the evidence on
  which they rely.
- Missing, conflicting, or unverifiable material must be reported as such.
- AI output is not evidence.
- Evidence access is tenant-scoped and subject to authorization.

## Provenance and integrity

At minimum, the conceptual record must preserve:

- the tenant and claim relationship,
- the evidence category and media or reference type,
- the known source and how it was obtained,
- the actor who added it,
- the observed, created, received, or retrieved time when known,
- an identifier for the original artifact or external reference,
- and links from every derived artifact back to its source material.

These are information requirements, not database columns. Hashing, storage
immutability, upload limits, malware scanning, retention, deletion, and formal
chain-of-custody mechanisms remain open implementation decisions governed by
`docs/SECURITY.md` and the active implementation plan.

Do not infer that uploaded material is authentic merely because it exists in
storage. Collection, integrity checking, and factual verification are separate
concerns.

## Case-level evidence readiness

Readiness describes whether a human can review the case; it does not declare
that every possible fact is proven.

| Status | Meaning |
| --- | --- |
| `NOT_ASSESSED` | No human-confirmed evidence readiness assessment exists. |
| `GAPS_IDENTIFIED` | Missing, conflicting, unavailable, or unverified material is recorded and the case is not yet ready for a decision. |
| `REVIEWABLE` | A human has confirmed that the available evidence and visible limitations are sufficient to decide whether to prepare a response or close the case. |

AI may suggest gaps or a readiness status, but a tenant-authorized human
confirms `REVIEWABLE`. `REVIEWABLE` does not imply that the seller should win,
that the return is illegitimate, or that a response must be created.
