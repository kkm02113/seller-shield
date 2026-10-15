import "server-only";
import type { WorkspaceSummary } from "./workspaces.ts";
import { TenantAuthorizationError } from "../../../platform/db/tenant-context.ts";

type WorkspaceReader = {
  listWorkspaces(): Promise<WorkspaceSummary[]>;
  getWorkspace(id: string): Promise<WorkspaceSummary>;
};
export type WorkspaceEntry = { kind: "create" } | { kind: "select"; workspaces: WorkspaceSummary[] }
  | { kind: "ready"; workspace: WorkspaceSummary };

export function createWorkspaceFlow(service: WorkspaceReader) {
  async function authorized(id: string) {
    try { return await service.getWorkspace(id); }
    catch (error) {
      if (error instanceof TenantAuthorizationError) return null;
      throw error; // An unavailable database is not an empty membership list.
    }
  }
  async function resolve(hint?: string): Promise<WorkspaceEntry> {
    if (hint) {
      const workspace = await authorized(hint);
      if (workspace) return { kind: "ready", workspace };
    }
    const workspaces = await service.listWorkspaces();
    if (workspaces.length === 0) return { kind: "create" };
    if (workspaces.length === 1) {
      const workspace = await authorized(workspaces[0].id);
      if (workspace) return { kind: "ready", workspace };
      // Membership changed after discovery. Render a safe retry, not stale data.
      return { kind: "select", workspaces: [] };
    }
    return { kind: "select", workspaces };
  }
  return { resolve };
}
