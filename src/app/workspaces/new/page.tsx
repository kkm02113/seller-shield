import { redirect } from "next/navigation";
import { SignOutButton } from "../../app/sign-out-button";
import { createWorkspaceAction } from "../actions";
import { getWorkspaceEntry } from "../server";
import { CreateWorkspaceForm } from "../workspace-forms";

export const dynamic = "force-dynamic";
export default async function NewWorkspacePage() {
  const { entry } = await getWorkspaceEntry(false);
  if (entry.kind === "ready") redirect("/app");
  if (entry.kind === "select") redirect("/workspaces");
  return <main className="shell" lang="ko"><section className="panel auth-panel">
    <p className="eyebrow">Seller Shield · 워크스페이스</p><h1>첫 워크스페이스 만들기</h1>
    <p>판매자 업무를 구분할 워크스페이스 이름을 정해주세요.</p>
    <CreateWorkspaceForm action={createWorkspaceAction} />
    <SignOutButton />
  </section></main>;
}
