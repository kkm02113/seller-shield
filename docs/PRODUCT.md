# Seller Shield product — MVP v0.1

## Status and decision labels

This document is the implementation-ready product specification for MVP v0.1.
It defines intended behavior; it does not claim that any application feature
is implemented.

- **DECIDED FOR MVP v0.1**: a product decision that implementation should
  follow unless a later approved decision changes it.
- **HYPOTHESIS**: a customer, market, positioning, or value assumption that
  requires evidence from real sellers and cases.
- **OPEN**: a technical or external-capability decision tracked in the active
  implementation plan.

The initial positioning line, "반품이 들어오면, 소명은 자동으로.", is a
**HYPOTHESIS**, not a validated promise. In MVP v0.1 it can only mean that
evidence organization and draft preparation are assisted. External submission
still requires explicit human action.

## 1. Problem

### Seller pain

When a return, refund, or claim dispute arrives, a seller may need to assemble
order details, shipment records, product identity, photos or videos, customer
service history, return-inspection findings, and the relevant marketplace
policy. These materials can be fragmented, difficult to verify, and expensive
to turn into a coherent response under time pressure.

The product must also preserve the valid outcome that a return is legitimate
and no defense is appropriate. It must not treat every return as abuse.

### Product solution — DECIDED FOR MVP v0.1

Seller Shield provides a tenant-scoped case workspace that:

1. captures a claim through a manual-first path,
2. organizes source-attributable evidence,
3. shows gaps and conflicts,
4. attaches an attributable, point-in-time marketplace policy reference,
5. prepares a cited response draft manually or with optional AI assistance,
6. requires human review before finalization,
7. exports a reviewable package, and
8. records the seller-entered submission and outcome.

Evidence comes before AI analysis. Generated summaries, inferences, and drafts
must never replace or be presented as source evidence.

Seller Shield analyzes the case, not the buyer. AI output is analysis or draft
material and never becomes evidence.

### Assumptions requiring validation

- **HYPOTHESIS:** target sellers encounter enough genuinely disputable cases
  for a dedicated workflow to be valuable.
- **HYPOTHESIS:** sellers possess usable evidence but lose time locating,
  checking, and presenting it.
- **HYPOTHESIS:** marketplaces materially consider the evidence and policy
  reasoning that sellers submit.
- **HYPOTHESIS:** time saved or losses avoided are meaningful enough to support
  recurring SaaS payment.
- **HYPOTHESIS:** a manual-first workflow is sufficient to validate value
  before marketplace API integration.

## 2. Initial ideal customer profile

The entire profile below is an **unvalidated ICP hypothesis**.

- A Korean online seller or seller-side operator.
- Primarily handles marketplace seller-fulfilled orders.
- Is initially Coupang-oriented; Naver or other marketplaces are later
  expansion candidates, not launch commitments.
- Processes roughly hundreds to several thousand orders per month.
- Handles customer service, returns, or claims internally rather than through
  a specialized dispute team.
- Sells products for which returned condition or product identity can affect a
  dispute, such as electronics, small appliances, tools, or collectibles.
- Experiences recurring effort gathering evidence and writing responses.

### Why this user may pay — HYPOTHESIS

This seller is more likely to pay if disputes recur often enough, evidence
preparation consumes measurable staff time, the workflow reduces corrections,
and the resulting package is usable in the seller's actual marketplace
process. None of those conditions is yet validated.

## 3. Jobs to be done

- When a return or claim dispute occurs, I want the relevant case information
  and evidence organized in one place, so that I can understand the case
  without searching across multiple systems.
- When I review a case, I want missing, conflicting, and unverified material
  called out, so that I do not submit a response based on an unsupported fact.
- When a marketplace rule matters, I want the exact source and version attached
  to the case, so that I can review the policy basis used in the response.
- When a response is warranted, I want a draft grounded in the evidence and
  policy references, so that I can prepare a defensible response quickly.
- Before finalizing a package, I want to inspect every important assertion and
  its support, so that I remain responsible for the external submission.
- After the marketplace responds, I want to record the outcome, so that I can
  evaluate whether the workflow is useful across real cases.

## 4. MVP P0 scope

The P0 loop is manual intake through recorded outcome. A marketplace connector
is not required to validate this loop.

### P0 capabilities — DECIDED FOR MVP v0.1

1. **Tenant-scoped access baseline**
   - Every case and evidence item belongs to a tenant context.
   - Authentication and tenant enforcement are required before real customer
     data is used; provider choice remains open.
2. **Case Inbox and manual case creation**
   - List cases and create a case without a marketplace API.
   - Capture source claim text and the minimum known identifiers without
     requiring unsupported facts.
3. **Case Detail and basic normalization**
   - Show the original claim content separately from normalized fields or
     summaries.
   - Allow incomplete drafts and identify missing information.
4. **Evidence Vault**
   - Attach or reference evidence with category, source, and provenance.
   - Preserve original material separately from derived content.
5. **Evidence readiness and case timeline**
   - Show whether evidence has not been assessed, has known gaps, or is ready
     for human review.
   - Present claim, evidence, review, package, submission, and outcome events in
     attributable order.
6. **Policy reference attachment**
   - Attach a manually sourced policy reference with marketplace, source,
     retrieval time, version or effective context when known, captured text or
     snapshot, and a content digest for the captured representation.
   - Preserve the point-in-time policy basis even if the source URL later
     changes.
   - Do not invent policy text or applicability.
7. **Manual response drafting**
   - Let the operator create, edit, and version a response draft without an
     LLM or external AI provider.
   - Preserve evidence and policy references used by the draft.
8. **Optional AI-assisted case analysis and response drafting**
   - Normalize claim text, summarize evidence, identify conflicts or gaps, and
     suggest response language with evidence and policy references.
   - Represent uncertainty explicitly as defined below and preserve the manual
     drafting path when AI is unavailable or disabled.
9. **Human review and response-package finalization**
   - Let the operator inspect supporting evidence and policy references before
     finalizing a versioned package.
   - Block autonomous external submission.
10. **Package export**
   - Export a stable, human-readable package suitable for the seller to use in
     an external process. PDF versus an equivalent printable format is an open
     implementation decision.
11. **Submission and outcome recording**
    - Record that the seller submitted externally and later record the result.
    - Do not imply that Seller Shield performed the external submission.

### Deliberately deferred

- Automated marketplace import or submission.
- Multi-marketplace launch coverage.
- Advanced media analysis or authenticity detection.
- Automated policy ingestion and applicability decisions.
- General order, inventory, warehouse, or customer-service management.

## 5. Explicit non-goals

- A buyer blacklist or shared buyer-reputation database.
- Automated consumer risk, fraud, or misconduct scoring.
- Person-level profiling across cases or tenants.
- Fabricating, enhancing, or altering source evidence to strengthen a case.
- Automatically rejecting legitimate returns.
- Autonomous external response submission in MVP v0.1.
- Supporting every Korean marketplace at launch.
- General OMS, inventory, warehouse, fulfillment, or CRM functionality.
- Advanced computer vision, deepfake detection, or media forensics.
- Marketplace-independent fraud detection.
- Treating an AI summary, inference, or draft as original evidence.

## 6. Primary user flows

### A. Create a claim

- **Trigger:** A seller receives a return, refund, or claim that needs review.
- **Steps:** Create the case manually; identify the marketplace when known;
  record the source claim content and known order or claim references; save it
  as a draft.
- **Success:** A tenant-scoped case exists in `DRAFT` without converting
  missing information into guessed facts.
- **Failure or empty states:** Missing optional details keep the case in draft
  and are shown as gaps. A possible duplicate is surfaced for human review,
  not silently merged. Marketplace import is unavailable unless a connector
  is explicitly implemented later.

### B. Review the claim

- **Trigger:** An operator opens a case from the inbox.
- **Steps:** Compare original claim content with normalized information; review
  known dates, parties, product identity, and requested remedy; decide whether
  the case may be a legitimate return, needs more evidence, or merits response
  review.
- **Success:** The operator understands the known facts and the next evidence
  action without a buyer-level label.
- **Failure or empty states:** Conflicting identifiers or missing source text
  remain visible. The system does not infer misconduct from absence of data.

### C. Attach evidence

- **Trigger:** The operator has source material relevant to the case.
- **Steps:** Add the original file or external reference; select its conceptual
  category; record the source and known context; optionally add a note; relate
  derived material back to the original.
- **Success:** The item is tenant-scoped, source-attributable, and linked to the
  case without modifying the original.
- **Failure or empty states:** Unknown provenance is labeled unknown rather
  than guessed. Failed or unsupported uploads do not create a false evidence
  record. A reference that cannot be retrieved remains unverified.

### D. Identify missing evidence

- **Trigger:** The operator requests readiness review or the evidence set
  changes.
- **Steps:** Review a case-specific list of expected or useful evidence; mark
  unavailable items; inspect conflicts; confirm whether the evidence is
  reviewable.
- **Success:** The case has a readiness status and a visible list of gaps,
  conflicts, and unavailable items.
- **Failure or empty states:** No generic checklist may claim completeness for
  every case. Lack of evidence cannot be treated as proof against the buyer.

### E. Create a response draft

- **Trigger:** A human decides that response preparation is appropriate and the
  case has reviewable evidence.
- **Steps:** Select the relevant evidence and policy reference; write and save a
  manual draft or optionally request AI assistance; show support and uncertainty
  for important assertions.
- **Success:** A draft exists whose factual assertions are traceable to the
  selected evidence or explicitly identified as uncertainty or inference.
- **Failure or empty states:** Missing policy sources, provider failure, or
  unsupported claims produce a visible warning and prevent silent finalization.
  Provider failure never blocks manual drafting. The original evidence remains
  unchanged.

### F. Review supporting evidence

- **Trigger:** A manual or AI-assisted response draft is available.
- **Steps:** Inspect each material assertion, its evidence references, policy
  basis, conflicts, and uncertainty labels; edit or reject draft language.
- **Success:** A human can explain why each retained factual assertion is in
  the package.
- **Failure or empty states:** Broken references, removed evidence, or
  unresolved unsupported assertions block package approval.

### G. Finalize and export the response package

- **Trigger:** The reviewer accepts the evidence, policy basis, and draft.
- **Steps:** Approve a package version; generate a stable human-readable
  export; download it for use in the external marketplace process.
- **Success:** The exported version is attributable to its reviewer, evidence
  set, policy reference, and approval time.
- **Failure or empty states:** Export failure preserves the approved source
  version for retry. Finalization never triggers autonomous submission.

### H. Record submission and result

- **Trigger:** The seller submits the package externally or receives a result.
- **Steps:** Record the submission time and external reference when known;
  later record the outcome and notes.
- **Success:** Submission and outcome are attributable case events and the case
  reaches the appropriate terminal state.
- **Failure or empty states:** Unknown outcome remains distinguishable from a
  seller-favorable or seller-unfavorable outcome. Seller-entered results are
  not presented as independently verified platform data.

## 7. Case lifecycle

The authoritative MVP v0.1 state machine, transition rules, actors, terminal
states, and closure/outcome dispositions are defined in
[`docs/domain/claims.md`](domain/claims.md). That lifecycle is a product
decision, not implemented behavior.

## 8. Evidence model

The authoritative conceptual evidence categories, readiness statuses,
provenance requirements, and original-versus-derived invariants are defined in
[`docs/domain/evidence.md`](domain/evidence.md). They intentionally do not
define database columns or a storage provider.

## 9. AI boundaries

### AI may

- normalize claim text while preserving the original,
- summarize selected evidence,
- identify conflicts and missing information,
- suggest questions or evidence needed for review,
- suggest response language from selected evidence and policy references.

### AI must not

- fabricate evidence, facts, identifiers, dates, or events,
- invent marketplace policy, versions, or applicability,
- silently infer buyer misconduct or person-level risk,
- modify or replace original evidence,
- hide conflicts or missing support,
- autonomously approve, finalize, or submit a response in MVP v0.1.

LLM availability must not be required to create, review, approve, or export a
manually written response package. AI failure leaves the manual workflow and
the last valid draft available.

### Uncertainty representation — DECIDED FOR MVP v0.1

Material analysis and draft assertions must use one of these meanings:

- **SUPPORTED:** directly backed by cited evidence or an attributable policy
  reference.
- **CONFLICTING:** sources disagree; the conflicting references remain visible.
- **MISSING:** information needed for the assertion or decision is absent.
- **UNVERIFIED:** source material exists, but its provenance, authenticity, or
  factual meaning has not been verified.
- **INFERENCE:** a clearly labeled conclusion drawn from cited material; it is
  not presented as a source fact.

Generated text must preserve these distinctions through human review and
export. A factual assertion without support or an explicit uncertainty label
cannot be silently finalized.

## 10. Success metrics

No numeric success threshold is yet validated. Thresholds must be declared as
hypotheses before a pilot decision, not chosen afterward to fit results.

### Product workflow metrics

- Median active case-preparation time from intake to reviewable case.
- Median time from reviewable case to finalized package.
- Percentage of reviewed cases reaching `REVIEWABLE` evidence status.
- Percentage of AI draft assertions edited or removed by the reviewer.
- Frequency and type of missing-evidence or conflict warnings.
- Percentage of created cases finalized as packages versus closed without a
  response; a close without a response is not automatically a failure.

### Business validation metrics

- Number of real cases processed per active seller per month.
- Repeat use after the first completed case.
- Seller willingness to pay demonstrated by a paid pilot, purchase commitment,
  or another observable commercial action.
- Seller-reported time saved relative to the seller's prior process.

### Metrics requiring real seller or marketplace data

- Seller-reported prevented loss.
- Marketplace outcome by package and claim type.
- Whether platform reviewers meaningfully consider submitted evidence and
  policy references.
- Actual marketplace integration coverage and reliability.

Self-reported loss or outcomes must be labeled as such and must not be used to
claim causality without appropriate evidence.

## 11. MVP validation plan

1. Recruit a small cohort matching the ICP hypothesis without claiming that
   the segment is validated.
2. Use real historical or live seller cases with permission and appropriate
   data handling.
3. Capture the seller's existing preparation steps, active time, available
   evidence, missing evidence, and outcome context as a baseline.
4. Run the manual-first Seller Shield workflow with assisted evidence
   organization and draft preparation.
5. Require the seller to review, correct, and approve the package; record all
   material corrections and rejected AI suggestions.
6. Let the seller submit through the existing marketplace process and record
   the seller-reported result without claiming direct platform verification.
7. Review product metrics, commercial action, and qualitative feedback before
   adding connectors or broader marketplace coverage.

Before expanding scope, the pilot must clarify:

- how often target sellers encounter genuinely disputable cases,
- which evidence they actually possess at the required time,
- which evidence and policy references platforms consider,
- how much active preparation time the workflow saves,
- how often generated drafts require material correction,
- whether sellers take an observable willingness-to-pay action,
- and whether API integration is necessary for value or only for scale.

## 12. Kill or pivot criteria

The current hypothesis should be stopped, narrowed, or materially changed if
real-case evidence shows that:

- target sellers encounter too few genuinely disputable cases for recurring
  use,
- sellers rarely possess usable evidence and Seller Shield cannot improve
  evidence readiness before a dispute,
- marketplaces do not materially consider seller evidence or policy-grounded
  responses,
- preparation cost and prevented loss are too small to support willingness to
  pay,
- AI draft correction is so extensive that the workflow does not save time or
  improve reliability,
- required integrations are unavailable, unstable, or disproportionately
  expensive relative to validated value,
- or sellers primarily need a different workflow, such as pre-dispute evidence
  capture, rather than response preparation.

No numeric kill threshold is fixed yet. The pilot must establish explicit
hypothesis thresholds before a go, narrow, pivot, or stop decision.

## 13. Implementation decisions

Approved architecture decisions are documented in
[`docs/ARCHITECTURE.md`](ARCHITECTURE.md) and `docs/adr/`. Remaining provider
and sequencing decisions are tracked with blocking timing in
[`docs/plans/active/0001-mvp-foundation.md`](plans/active/0001-mvp-foundation.md).
Neither a decision nor a plan is a product capability until implemented and
verified.
