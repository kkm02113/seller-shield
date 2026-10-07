// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Better Auth captures fetch at client creation; stub the HTTP boundary before
// importing that real client, rather than replacing its methods with mocks.
const http = vi.hoisted(() => vi.fn());
vi.hoisted(() => { vi.stubGlobal("fetch", http); });

import { SignInForm } from "../src/app/sign-in/sign-in-form";
import { ConfirmationForm } from "../src/app/auth/verify/confirmation-form";
import { OnboardingForm } from "../src/app/onboarding/onboarding-form";

afterEach(() => { cleanup(); http.mockReset(); vi.useRealTimers(); window.history.replaceState(null, "", "/"); });

describe("authentication UI", () => {
  it("submits only an email and disables resend for the 60-second UX countdown", async () => {
    vi.useFakeTimers();
    const bodies: unknown[] = [];
    http.mockImplementation(async (_input: unknown, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return Response.json({ status: true });
    });
    render(<SignInForm />);
    fireEvent.change(screen.getByLabelText("이메일"), { target: { value: "seller@example.test" } });
    await act(async () => { fireEvent.submit(screen.getByRole("button", { name: "로그인 링크 받기" }).closest("form")!); });
    expect(bodies).toEqual([{ email: "seller@example.test" }]);
    expect(screen.getByRole("status").textContent).toContain("발송 요청을 접수");
    expect((screen.getByRole("button", { name: "60초 후 재전송" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { vi.advanceTimersByTime(60_000); });
    expect((screen.getByRole("button", { name: "로그인 링크 받기" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("does not claim success when the server cannot send mail", async () => {
    http.mockImplementation(async () => Response.json({ code: "EMAIL_UNAVAILABLE", message: "Email delivery unavailable." }, { status: 503 }));
    render(<SignInForm />);
    fireEvent.change(screen.getByLabelText("이메일"), { target: { value: "seller@example.test" } });
    await act(async () => { fireEvent.submit(screen.getByRole("button").closest("form")!); });
    expect(screen.getByRole("alert").textContent).toContain("메일을 보내지 못했습니다");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("never verifies on initial confirmation render and rejects missing fragments on user action", async () => {
    const fetcher = http;
    render(<ConfirmationForm />);
    expect(fetcher).not.toHaveBeenCalled();
    await act(async () => { fireEvent.submit(screen.getByRole("button", { name: "로그인 계속" }).closest("form")!); });
    expect(screen.getByRole("alert").textContent).toBe("로그인 링크를 확인할 수 없습니다.");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects blank or overlong onboarding names before making a request", async () => {
    const fetcher = http;
    render(<OnboardingForm />);
    for (const name of [" \t ", "x".repeat(81)]) {
      fireEvent.change(screen.getByLabelText("이름"), { target: { value: name } });
      await act(async () => { fireEvent.submit(screen.getByRole("button").closest("form")!); });
      expect(screen.getByRole("alert").textContent).toContain("1~80자");
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
});
