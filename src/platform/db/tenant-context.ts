import "server-only";
import { and, eq, sql } from "drizzle-orm";
import type { Database } from "./connection.ts";
import { memberships } from "./schema/tenancy.ts";

export type TenantTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type MembershipRole = (typeof memberships.$inferSelect)["role"];
export type AuthenticatedActorContext = Readonly<{ actorId: string; tx: TenantTransaction }>;
export type AccessContext = AuthenticatedActorContext & Readonly<{
  tenantId: string; membershipId: string; role: MembershipRole;
}>;
export class TenantAuthorizationError extends Error {
  constructor() { super("Workspace access denied."); this.name = "TenantAuthorizationError"; }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// loadActor is a trusted server composition seam, not a client actor parameter.
export function createTenantBoundary(database: Database, loadActor: () => Promise<{ id: string } | null>) {
  async function withAuthenticatedActor<T>(operation: (context: AuthenticatedActorContext) => Promise<T>): Promise<T> {
    const actor = await loadActor();
    if (!actor || !uuid.test(actor.id)) throw new Error("Authentication required.");
    return database.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.actor_id', ${actor.id}, true), set_config('app.tenant_id', '', true)`);
      return operation({ actorId: actor.id, tx });
    }, { isolationLevel: "read committed" });
  }
  async function withTenantContext<T>(tenantId: string, operation: (context: AccessContext) => Promise<T>): Promise<T> {
    return withAuthenticatedActor(async ({ actorId, tx }) => {
      if (typeof tenantId !== "string" || !uuid.test(tenantId)) throw new TenantAuthorizationError();
      const [membership] = await tx.select({ id: memberships.id, tenantId: memberships.tenantId, role: memberships.role })
        .from(memberships).where(and(eq(memberships.userId, actorId), eq(memberships.tenantId, tenantId),
          eq(memberships.status, "ACTIVE"))).limit(1).for("share");
      if (!membership) throw new TenantAuthorizationError();
      await tx.execute(sql`select set_config('app.tenant_id', ${membership.tenantId}, true)`);
      return operation({ actorId, tenantId: membership.tenantId, membershipId: membership.id, role: membership.role, tx });
    });
  }
  return { withAuthenticatedActor, withTenantContext };
}
export type TenantBoundary = ReturnType<typeof createTenantBoundary>;
