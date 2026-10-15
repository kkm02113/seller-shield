import { redirect } from "next/navigation";
import { SignOutButton } from "../app/sign-out-button";
import { selectWorkspaceAction } from "./actions";
import { getWorkspaceEntry } from "./server";
import { SelectWorkspaceForm } from "./workspace-forms";

export const dynamic = "force-dynamic";
export default async function WorkspacesPage() {
  const { entry } = await getWorkspaceEntry(false);
  if (entry.kind === "create") redirect("/workspaces/new");
  if (entry.kind === "ready") redirect("/app");
  return <main className="shell" lang="ko"><section className="panel auth-panel">
    <p className="eyebrow">Seller Shield · 워크스페이스</p><h1>워크스페이스 선택</h1>
    {entry.workspaces.length > 0 ? <><p>접근 가능한 워크스페이스를 선택해주세요.</p>
      <SelectWorkspaceForm action={selectWorkspaceAction} workspaces={entry.workspaces} /></>
      : <><p role="status">워크스페이스 접근 권한이 변경되었습니다. 목록을 다시 확인해주세요.</p>
        <a href="/workspaces">목록 다시 확인</a></>}
    <SignOutButton />
  </section></main>;
}
