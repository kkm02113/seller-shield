import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { memberships, tenants } from "../../../platform/db/schema/tenancy.ts";
import { TenantAuthorizationError, type MembershipRole, type TenantBoundary } from "../../../platform/db/tenant-context.ts";
import { requireWorkspaceName } from "../domain/workspace-name.ts";
import { tenantBoundary } from "./context.ts";

export type WorkspaceSummary = Readonly<{ id: string; name: string; role: MembershipRole }>;

export function createWorkspaceService(boundary: TenantBoundary) {
  async function getWorkspace(tenantId: string): Promise<WorkspaceSummary> {
    return boundary.withTenantContext(tenantId, async ({ tenantId: canonicalTenant, role, tx }) => {
      let workspace;
      try {
        [workspace] = await tx.select({ id: tenants.id, name: tenants.name }).from(tenants)
          .where(eq(tenants.id, canonicalTenant));
      } catch { throw new Error("Workspace unavailable."); }
      if (!workspace) throw new TenantAuthorizationError();
      return { ...workspace, role };
    });
  }
  async function listWorkspaces(): Promise<WorkspaceSummary[]> {
    return boundary.withAuthenticatedActor(async ({ actorId, tx }) => {
      try {
        return await tx.select({ id: tenants.id, name: tenants.name, role: memberships.role })
          .from(tenants).innerJoin(memberships, eq(memberships.tenantId, tenants.id))
          .where(and(eq(memberships.userId, actorId), eq(memberships.status, "ACTIVE")))
          .orderBy(asc(tenants.createdAt), asc(tenants.id));
      } catch { throw new Error("Workspace discovery unavailable."); }
    });
  }
  async function createFirstWorkspace(input: unknown): Promise<WorkspaceSummary> {
    const name = requireWorkspaceName(input);
    return boundary.withAuthenticatedActor(async ({ actorId, tx }) => {
      try {
        const [created] = await tx.execute<{ id: string }>(sql`select public.create_first_workspace(${name}) as id`);
        const [workspace] = await tx.select({ id: tenants.id, name: tenants.name, role: memberships.role })
          .from(tenants).innerJoin(memberships, eq(memberships.tenantId, tenants.id))
          .where(and(eq(tenants.id, created.id), eq(memberships.userId, actorId), eq(memberships.status, "ACTIVE")));
        if (!workspace) throw new Error("Missing created workspace.");
        return workspace;
      } catch { throw new Error("Workspace creation denied."); }
    });
  }
  async function renameWorkspace(tenantId: string, input: unknown): Promise<WorkspaceSummary> {
    const name = requireWorkspaceName(input);
    return boundary.withTenantContext(tenantId, async ({ role, tenantId: canonicalTenant, tx }) => {
      if (role !== "OWNER") throw new TenantAuthorizationError();
      let workspace;
      try {
        [workspace] = await tx.update(tenants).set({ name, updatedAt: new Date() })
          .where(eq(tenants.id, canonicalTenant)).returning({ id: tenants.id, name: tenants.name });
      } catch { throw new Error("Workspace update unavailable."); }
      if (!workspace) throw new TenantAuthorizationError();
      return { ...workspace, role };
    });
  }
  return { listWorkspaces, getWorkspace, createFirstWorkspace, renameWorkspace };
}

export const { listWorkspaces, getWorkspace, createFirstWorkspace, renameWorkspace } = createWorkspaceService(tenantBoundary);
