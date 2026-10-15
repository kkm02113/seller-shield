import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createWorkspaceFlow } from "../src/modules/identity/application/workspace-flow";
import { TenantAuthorizationError } from "../src/platform/db/tenant-context";
import type { WorkspaceSummary } from "../src/modules/identity/application/workspaces";

const workspace = { id: "11111111-1111-4111-8111-111111111111", name: "Workspace A", role: "OWNER" as const };
const second = { id: "22222222-2222-4222-8222-222222222222", name: "Workspace B", role: "REVIEWER" as const };
function service(choices: WorkspaceSummary[] = [workspace]) {
  return {
    listWorkspaces: async () => choices,
    getWorkspace: async (id: string) => {
      const selected = choices.find((value) => value.id === id);
      if (!selected) throw new TenantAuthorizationError();
      return selected;
    },
  };
}
describe("workspace application entry", () => {
  it("routes zero ACTIVE memberships to creation", async () => {
    expect(await createWorkspaceFlow(service([])).resolve()).toEqual({ kind: "create" });
  });
  it("revalidates the sole membership before automatically entering", async () => {
    const dependencies = service();
    dependencies.getWorkspace = async () => ({ ...workspace, role: "REVIEWER" });
    expect(await createWorkspaceFlow(dependencies).resolve()).toEqual({ kind: "ready", workspace: { ...workspace, role: "REVIEWER" } });
  });
  it("shows the selector for multiple memberships without a valid hint", async () => {
    expect(await createWorkspaceFlow(service([workspace, second])).resolve()).toEqual({ kind: "select", workspaces: [workspace, second] });
  });
  it("uses a hint only after fresh scoped authorization, never a supplied role", async () => {
    expect(await createWorkspaceFlow(service([workspace, second])).resolve(second.id))
      .toEqual({ kind: "ready", workspace: second });
  });
  it("ignores forged/stale hints and falls back to current memberships", async () => {
    for (const hint of ["forged", second.id]) {
      expect(await createWorkspaceFlow(service()).resolve(hint)).toEqual({ kind: "ready", workspace });
      expect(await createWorkspaceFlow(service([])).resolve(hint)).toEqual({ kind: "create" });
    }
  });
  it("does not render a membership revoked between discovery and authorization", async () => {
    const dependencies = service();
    dependencies.getWorkspace = async () => { throw new TenantAuthorizationError(); };
    expect(await createWorkspaceFlow(dependencies).resolve()).toEqual({ kind: "select", workspaces: [] });
  });
  it("does not turn a DB/server failure into zero memberships or accepted hint", async () => {
    const dependencies = service();
    dependencies.getWorkspace = async () => { throw new Error("Workspace unavailable."); };
    await expect(createWorkspaceFlow(dependencies).resolve(workspace.id)).rejects.toThrow("Workspace unavailable.");
    dependencies.listWorkspaces = async () => { throw new Error("Workspace discovery unavailable."); };
    await expect(createWorkspaceFlow(dependencies).resolve()).rejects.toThrow("Workspace discovery unavailable.");
  });
});
