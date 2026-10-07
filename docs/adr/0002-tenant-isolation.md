# ADR-002: Tenant isolation and authorization

- **Status:** Accepted
- **Implementation:** Tenant/Membership/authorization/RLS NOT IMPLEMENTED;
  Slice 1B-2 sign-in is locally validated with captured email, not tenant access.
- **Revision:** 2026-10-01 — Better Auth replaces the original Auth.js choice
  before authentication implementation; tenant authorization is unchanged.

## Context

Claims and evidence contain sensitive seller and customer data. Filtering by a
client-provided tenant identifier is insufficient, and authentication does not
prove authorization to a tenant resource.

## Decision

Use Better Auth with database-backed sessions and this minimal identity model:

- `User`: authenticated person.
- `Tenant`: seller workspace and ownership boundary.
- `Membership`: relationship between a user and tenant with role `OWNER`,
  `OPERATOR`, or `REVIEWER`.

Authentication core records are GLOBAL. Better Auth organization/multi-tenant
and admin/role plugins are not used; they must not introduce a second authority
for Seller Shield's Tenant, Membership, or roles. Dependency selection and
Slice 1B-1/1B-2 boundaries are owned by
[`ARCHITECTURE.md`](../ARCHITECTURE.md#authentication-and-tenant-model).

`OWNER` manages the workspace and can perform all MVP actions. `OPERATOR`
manages cases, evidence, policies, and drafts. `REVIEWER` can review and
approve packages and record submissions/outcomes. Enterprise RBAC and custom
permissions are out of scope.

Every tenant-owned operation must:

1. validate the server-side session,
2. resolve an active membership for the requested tenant,
3. authorize the operation by role,
4. execute in a tenant-scoped PostgreSQL transaction,
5. set a transaction-local tenant/actor context,
6. rely on Row-Level Security as defense in depth,
7. include `tenant_id` in tenant-owned relationships and use composite tenant
   constraints where relationships could otherwise cross tenants.

The application database role must not have `BYPASSRLS`; migration ownership
uses a separate role. Background jobs restore and verify tenant context before
touching tenant data. UI routing or client filtering is never an authorization
boundary.

The initial sign-in method remains email magic link, implemented only in
Slice 1B-2 through Better Auth's Magic Link plugin. The transactional email
decision and operational gates are recorded in Architecture/Security; real
delivery and real-customer production approval remain separate from local validation.

## Consequences

- Data access code must use a single tenant-context entry point instead of
  arbitrary database queries.
- Integration tests must exercise cross-tenant identifiers for every module.
- RLS transaction handling and connection pooling require deliberate tests.
- One user can belong to multiple tenants without duplicating identity.

## References

- <https://authjs.dev/getting-started/migrate-to-better-auth>
- <https://better-auth.com/docs/concepts/session-management>
- <https://better-auth.com/docs/adapters/drizzle>
- <https://www.postgresql.org/docs/current/ddl-rowsecurity.html>
