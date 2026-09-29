# ADR-003: Evidence storage and integrity

- **Status:** Accepted
- **Implementation:** NOT IMPLEMENTED

## Context

Evidence can contain large and sensitive files. It must remain private,
tenant-authorized, attributable, and distinguishable from derived artifacts.
The MVP does not require legal chain-of-custody certification.

## Decision

Use private S3-compatible object storage with metadata and relationships in
PostgreSQL.

- Objects are never public.
- The application authorizes each upload/download before issuing a short-lived
  presigned URL.
- A presigned upload targets a unique staging key, never an accepted original's
  final key.
- Finalization verifies metadata, size, and expected checksum, then promotes the
  staging object server-side to a new unique final key and records only the
  final object/version.
- An original final object is never silently overwritten; replaying an unexpired
  staging URL cannot change the already accepted final object.
- Record SHA-256 for original evidence. Prefer a provider-verified checksum;
  otherwise a trusted worker streams the completed object and calculates it.
- Derived artifacts use separate keys and records linked to their originals.
- Object-key prefixes may aid operations but are not an authorization control.
- Approved packages record an immutable manifest of selected evidence IDs,
  versions, and digests so later deletion does not silently rewrite history.
- Retention/deletion state is represented in metadata so provider lifecycle
  rules can be added without changing the domain boundary.

A SHA-256 digest shows whether compared bytes match the captured bytes. It does
not prove the source identity, authenticity, factual truth, capture time, or
absence of earlier manipulation.

## Consequences

- The storage provider and region remain selectable if they implement the
  required S3 semantics and privacy terms.
- Signed URLs are bearer capabilities and must be short-lived, narrowly scoped,
  excluded from logs, and regenerated after authorization. Staging objects need
  an expiry cleanup rule.
- Evidence deletion must consider approved-package references and present an
  explicit unavailable/deleted state rather than a broken silent reference.
- Formal WORM/object-lock controls are deferred unless a validated requirement
  emerges.

## References

- <https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html>
