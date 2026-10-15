import { redirect } from "next/navigation";
import { getWorkspaceEntry } from "../workspaces/server";
import { SignOutButton } from "./sign-out-button";

export const dynamic = "force-dynamic";
export default async function AccountPage() {
  const { user, entry } = await getWorkspaceEntry();
  if (entry.kind === "create") redirect("/workspaces/new");
  if (entry.kind === "select") redirect("/workspaces");
  const { workspace } = entry;
  return <main className="shell" lang="ko"><section className="panel auth-panel">
    <p className="eyebrow">Seller Shield · 워크스페이스</p><h1>{workspace.name}</h1>
    <p>{user.name}님, 환영합니다.</p><p>{user.email}</p>
    <p>현재 역할: {workspace.role}</p>
    <SignOutButton />
  </section></main>;
}
