// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CreateWorkspaceForm, SelectWorkspaceForm } from "../src/app/workspaces/workspace-forms";
afterEach(cleanup);

describe("workspace forms", () => {
  it("submits only the name field and shows server validation errors", async () => {
    const submitted: [string, FormDataEntryValue][][] = [];
    render(<CreateWorkspaceForm action={async (_state, data) => {
      submitted.push([...data.entries()]); return { error: "이름은 1~80자로 입력해주세요." };
    }} />);
    fireEvent.change(screen.getByLabelText("워크스페이스 이름"), { target: { value: "   " } });
    await act(async () => { fireEvent.submit(screen.getByRole("button", { name: "워크스페이스 만들기" }).closest("form")!); });
    expect(submitted).toEqual([[["name", "   "]]]);
    expect(screen.getByRole("alert").textContent).toContain("1~80");
  });
  it("blocks a second UI submission while the server action is pending", async () => {
    let finish!: (state: { error: string }) => void;
    const waiting = new Promise<{ error: string }>((resolve) => { finish = resolve; });
    render(<CreateWorkspaceForm action={async () => waiting} />);
    fireEvent.change(screen.getByLabelText("워크스페이스 이름"), { target: { value: "조직" } });
    await act(async () => { fireEvent.submit(screen.getByRole("button").closest("form")!); });
    expect((screen.getByRole("button", { name: "생성 중…" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { finish({ error: "다시 시도해주세요." }); });
    expect((screen.getByRole("button", { name: "워크스페이스 만들기" }) as HTMLButtonElement).disabled).toBe(false);
  });
  it("renders only supplied active choices and sends the selector, never a role", async () => {
    const submitted: [string, FormDataEntryValue][][] = [];
    render(<SelectWorkspaceForm workspaces={[{ id: "own-tenant", name: "내 워크스페이스", role: "REVIEWER" }]}
      action={async (_state, data) => { submitted.push([...data.entries()]); return { error: "선택할 수 없습니다." }; }} />);
    fireEvent.change(screen.getByLabelText("워크스페이스"), { target: { value: "own-tenant" } });
    await act(async () => { fireEvent.submit(screen.getByRole("button").closest("form")!); });
    expect(submitted).toEqual([[["tenantId", "own-tenant"]]]);
    expect(screen.getByRole("alert").textContent).toBe("선택할 수 없습니다.");
  });
});
