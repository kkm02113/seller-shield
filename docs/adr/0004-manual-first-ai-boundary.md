# ADR-004: Manual-first AI boundary

- **Status:** Accepted
- **Implementation:** NOT IMPLEMENTED

## Context

Seller Shield's durable value is evidence, provenance, policy basis, and case
history. If LLM availability is required to create or export a response, a
provider outage can block a time-sensitive seller workflow.

## Decision

`ResponseDraft` is a first-class manual domain object. Manual create, edit,
review, approve, and export paths have no dependency on an LLM provider.

Optional AI assistance is exposed through one narrow application port, such as
`ResponseAssistant.suggestDraft(input)`, implemented by a replaceable provider
adapter. It is not a general-purpose AI framework.

- The server sends only explicitly selected case material.
- Customer, marketplace, policy, and uploaded text are untrusted data, not
  instructions; the model receives no autonomous tools or network access.
- Provider output must match a Zod schema.
- The server verifies every returned evidence/policy reference belongs to the
  authorized tenant, case, and supplied input set.
- Unsupported references are rejected or visibly marked, never promoted to
  `SUPPORTED`.
- Provider/model/prompt version and attempt status are attributable without
  logging unnecessary PII or secrets.
- Failure preserves the last valid manual/draft version and does not advance
  case state.
- AI never approves packages, submits externally, or becomes evidence.

The concrete LLM vendor/model remains open until privacy, region, retention,
training-use, cost, and structured-output behavior are reviewed.

## Consequences

- Slice 4 starts with the manual editor; AI assistance can follow independently.
- Provider replacement does not change response-domain types.
- No vector database, RAG platform, agent framework, or model fine-tuning is
  introduced in MVP v0.1.
