# Seller Shield security and privacy

These are durable requirements and approved architecture controls for future
implementation. Slice 0 contains only a public development shell and
process-health route; none of the controls below is claimed as implemented
unless this document is updated with code and validation references.

## Status

`DECIDED`: Better Auth database-backed sessions; User identity separate from
Tenant/Membership roles;
server-side membership authorization; PostgreSQL RLS and tenant-aware
relationships; private S3-compatible objects; short-lived authorized URLs;
SHA-256 for original evidence; point-in-time policy captures; manual-first AI
boundary; structured logs and attributable audit/domain events.

`NOT IMPLEMENTED`: Every control above, including authentication,
authorization, RLS, object access, hashing, logging, audit events, and provider
data controls.

`OPEN`: Hosting/provider regions, transactional email provider, object-storage
vendor, LLM vendor/model, error-reporting vendor, concrete retention periods,
and deletion workflows.

## PII and customer data

- Collect and expose only data needed for the case workflow.
- Treat claim, order, buyer, seller, message, address, contact, and evidence
  data as potentially sensitive until a data classification says otherwise.
- Do not repurpose case data to build buyer profiles, blacklists, or shared
  reputation records.
- Redact sensitive data from logs, errors, fixtures, screenshots, and model
  prompts unless it is strictly required and protected.

## Tenant isolation and authorization

- Better Auth authenticates a GLOBAL User only. A core Session does not prove
  Tenant membership or a Seller Shield role. Organization/multi-tenant and
  admin/role plugins must not compete with the domain authorization model.
- Slice 1B-1 is persistence-only and remains NOT IMPLEMENTED. Magic Link,
  delivery, and usable sign-in belong to 1B-2; Tenant/Membership/RLS belong to
  1C. See the [architecture boundary](ARCHITECTURE.md#authentication-and-tenant-model--decided-not-implemented).
- Core auth tables use explicit runtime CRUD grants, not ownership or
  SUPERUSER/BYPASSRLS/schema CREATE. Global adapter access is not tenant access.
- Database-backed sessions must not silently become stateless/JWT or secondary
  storage sessions. Cookie caching stays disabled in the foundation so deleted
  or expired sessions are rechecked against PostgreSQL.
- Every access to tenant-owned claims, evidence, policies, responses,
  submissions, and outcomes must enforce the tenant boundary.
- Authentication alone is not authorization. Check the actor's permission for
  the requested resource and action.
- Cross-tenant identifiers must not grant access by possession or guessability.
- Background work and administrative paths must enforce equivalent isolation.
- Resolve User membership and role server-side, then execute tenant-owned work
  in a transaction-scoped tenant context.
- Establish RLS context actor-first: set the authenticated actor locally,
  resolve only that actor's Membership for the requested Tenant, authorize the
  capability, and set the tenant context only after that check succeeds.
- Use PostgreSQL RLS as defense in depth with an application role that cannot
  bypass RLS; migrations use a separate owner role.
- Use tenant-aware relationships/composite constraints where a foreign key
  could otherwise connect two tenants.
- Treat `background_jobs` as a SYSTEM queue with tenant attribution. A worker
  may claim across that queue through a table-specific policy, but must obtain
  the job tenant and open a separate tenant-scoped transaction before reading
  Case, Evidence, Policy, Response, or Package data.
- The worker role must not own tenant tables or have `BYPASSRLS`. Tenant RLS
  admits worker access only for a valid, unexpired leased job context.
- Integration tests must prove that forcing a Tenant ID for which the actor has
  no Membership cannot acquire authorization or expose Case/Evidence rows.

## Evidence access and integrity

- Preserve raw evidence and its source provenance.
- Derived, normalized, verified, and AI-produced material must remain
  distinguishable from raw evidence.
- Evidence changes and access should be auditable at a level appropriate to
  the sensitivity and dispute workflow.
- Do not overwrite a source artifact in a way that erases its original form.
- Store objects privately, issue short-lived signed access only after
  authorization, and never log signed URLs.
- Record SHA-256 for original evidence. A digest can detect byte differences;
  it does not prove authenticity, truth, source identity, or capture time.
- Approved package manifests preserve selected evidence versions and digests;
  later deletion must not silently rewrite the historical basis.
- Approved packages are fully reconstructable only while required Artifact
  bytes remain retained. After permitted physical deletion, immutable manifest,
  identity, digest, and deletion tombstone records remain auditable, but the
  product must report that binary reconstruction is unavailable.
- Legal chain-of-custody and WORM/object-lock controls are not MVP claims.

## Auditability

- Record security-relevant and case-relevant actions with actor, tenant,
  action, target, and time where lawful and proportionate.
- Keep automated analysis and human decisions distinguishable.
- Record the reproducible policy basis and evidence references used for a case
  decision or response package. Policy capture includes source, retrieval time,
  known effective/version context, captured representation, and digest.
- External submission must remain a separately attributable human-approved
  action under the current product boundary.

## Retention and deletion

- Define retention by data category and legal/product need before production
  data is stored.
- Support tenant-scoped deletion while preserving only records that must be
  retained for a documented legal or audit basis.
- Ensure copies, derived artifacts, logs, backups, and external processors are
  covered by the retention and deletion design.
- Concrete periods and deletion workflows are `NOT YET IMPLEMENTED / UNKNOWN`.
- An active package/legal/security retention hold blocks physical byte deletion.
  Unlinking Evidence or logically deleting a Case never removes approved
  package history or Artifact tombstones.

## Credentials and secrets

- Future Better Auth secret/base-URL configuration stays server-only and uses
  the variables defined in [ARCHITECTURE.md](ARCHITECTURE.md#authentication-and-tenant-model--decided-not-implemented).
  Validation errors must not include the supplied secret or database URL.
- Session tokens, verification values, provider tokens, and optional session
  IP/user-agent fields are sensitive. Retain the official nullable core fields,
  but decide actual collection/retention before 1B-2 accepts real users; never
  log these values or treat them as buyer reputation data.
- Never commit credentials, tokens, private keys, or production secrets.
- Load secrets through the deployment environment's approved secret facility.
- Scope credentials to the minimum tenant, provider, permissions, and lifetime
  practical; rotate and revoke them when exposed.
- Do not include secrets in logs, client bundles, generated response packages,
  documentation examples, or model prompts.

## AI handling of customer data

- AI output is analysis or draft material, never evidence.
- Send only the minimum necessary customer data to an AI provider.
- Provider, region, retention, training-use, and deletion terms must be
  reviewed before customer data is sent.
- Preserve input evidence references and make unsupported generated claims
  detectable during human review.
- Do not permit a model to submit a dispute externally without the required
  human approval.
- Treat customer, marketplace, policy, and uploaded content as untrusted data,
  not model instructions; the model receives no autonomous tools or network
  access in MVP.
- Validate structured output and verify every returned evidence/policy
  reference against the authorized tenant, case, and supplied input set.
- LLM unavailability must not block manual response drafting, package approval,
  or export, and failures must not advance workflow state.

## Change requirement

Any implementation touching authentication, authorization, tenant-owned data,
evidence, external providers, deletion, audit records, or model prompts must
review this document and report which requirements are implemented, deferred,
or not applicable. Do not convert an unmet requirement into a confirmed
control without code and validation evidence.
