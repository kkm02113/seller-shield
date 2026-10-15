import "server-only";
import { requireOnboardedUser } from "../../platform/auth/session.ts";
import { cookies } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { createWorkspaceFlow } from "../../modules/identity/application/workspace-flow.ts";
import { listWorkspaces, getWorkspace } from "../../modules/identity/application/workspaces.ts";

export const workspaceFlow = createWorkspaceFlow({ listWorkspaces, getWorkspace });
export const WORKSPACE_COOKIE = "current_workspace";
export async function getWorkspaceEntry(useHint = true) {
  const user = await requireOnboardedUser();
  const hint = useHint ? (await cookies()).get(WORKSPACE_COOKIE)?.value : undefined;
  try { return { user, entry: await workspaceFlow.resolve(hint) }; }
  catch (error) {
    unstable_rethrow(error);
  }
  // Preserve framework redirects, but never attach SQL-bearing causes to an
  // error that Next may log or serialize at the UI boundary.
  throw new Error("Workspace temporarily unavailable.");
}
