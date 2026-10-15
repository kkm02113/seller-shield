import "server-only";
import { requireUser } from "../../../platform/auth/session.ts";
import { db } from "../../../platform/db/client.ts";
import { createTenantBoundary } from "../../../platform/db/tenant-context.ts";

// Actor identity is always derived from the verified server-side session.
// Cookies/URLs/headers may select a tenant, but can never supply actor or role.
export const tenantBoundary = createTenantBoundary(db, requireUser);
export const { withAuthenticatedActor, withTenantContext } = tenantBoundary;
