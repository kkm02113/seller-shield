"use client";
import { useActionState } from "react";
import type { WorkspaceSummary } from "../../modules/identity/application/workspaces";
type Action = (state: { error: string }, data: FormData) => Promise<{ error: string }>;
export function CreateWorkspaceForm({ action }: { action: Action }) {
  const [state, submit, pending] = useActionState(action, { error: "" });
  return <form action={submit} noValidate className="auth-form">
    <label htmlFor="workspace-name">워크스페이스 이름</label>
    <input id="workspace-name" name="name" required autoComplete="organization" aria-describedby="workspace-name-help"
      readOnly={pending} />
    <p id="workspace-name-help" className="auth-note">앞뒤 공백을 제외한 1~80자 이름을 입력해주세요.</p>
    {state.error && <p role="alert" className="auth-error">{state.error}</p>}
    <button type="submit" disabled={pending}>{pending ? "생성 중…" : "워크스페이스 만들기"}</button>
  </form>;
}
export function SelectWorkspaceForm({ action, workspaces }: { action: Action; workspaces: WorkspaceSummary[] }) {
  const [state, submit, pending] = useActionState(action, { error: "" });
  return <form action={submit} className="auth-form">
    <label htmlFor="workspace-choice">워크스페이스</label>
    <select id="workspace-choice" name="tenantId" required defaultValue="" disabled={pending}>
      <option value="" disabled>워크스페이스를 선택해주세요</option>
      {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name} · {workspace.role}</option>)}
    </select>
    {state.error && <p role="alert" className="auth-error">{state.error}</p>}
    <button type="submit" disabled={pending}>{pending ? "확인 중…" : "선택한 워크스페이스로 이동"}</button>
  </form>;
}
