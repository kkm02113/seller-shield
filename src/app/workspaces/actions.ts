"use server";
import { cookies } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { requireOnboardedUser } from "../../platform/auth/session.ts";
import { createFirstWorkspace, getWorkspace } from "../../modules/identity/application/workspaces.ts";
import { requireWorkspaceName } from "../../modules/identity/domain/workspace-name.ts";
import { WORKSPACE_COOKIE, workspaceFlow } from "./server.ts";

async function saveHint(id: string, clear = false) {
  (await cookies()).set(WORKSPACE_COOKIE, clear ? "" : id, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/",
    ...(clear ? { maxAge: 0 } : {}),
  });
}
export async function createWorkspaceAction(_state: { error: string }, data: FormData) {
  await requireOnboardedUser();
  let name;
  try { name = requireWorkspaceName(data.get("name")); }
  catch { return { error: "워크스페이스 이름은 앞뒤 공백을 제외하고 1~80자로 입력해주세요." }; }
  let workspace;
  try { workspace = await createFirstWorkspace(name); }
  catch (error) {
    unstable_rethrow(error);
    // A competing submission may already have committed the first workspace.
    // Resolve through fresh authorization, not through client hints or SQL.
    let entry;
    try { entry = await workspaceFlow.resolve(); }
    catch (failure) {
      unstable_rethrow(failure);
      return { error: "워크스페이스를 만들지 못했습니다. 잠시 후 다시 시도해주세요." };
    }
    if (entry.kind === "ready") workspace = entry.workspace;
    else if (entry.kind === "select" && entry.workspaces.length > 0) {
      await saveHint("", true);
      redirect("/workspaces");
    } else return { error: "워크스페이스를 만들지 못했습니다. 잠시 후 다시 시도해주세요." };
  }
  await saveHint(workspace.id);
  redirect("/app");
}
export async function selectWorkspaceAction(_state: { error: string }, data: FormData) {
  await requireOnboardedUser();
  let workspace;
  try {
    const tenantId = data.get("tenantId");
    if (typeof tenantId !== "string") throw new Error("Invalid selector.");
    workspace = await getWorkspace(tenantId);
  } catch (error) {
    unstable_rethrow(error);
    await saveHint("", true);
    return { error: "워크스페이스를 선택할 수 없습니다. 목록을 새로 확인해주세요." };
  }
  await saveHint(workspace.id);
  redirect("/app");
}
