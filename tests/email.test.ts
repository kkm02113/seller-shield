import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { requireEmailEnvironment } from "../src/platform/email/env";
import { createResendEmailSender } from "../src/platform/email/resend";

const environment = { RESEND_API_KEY: "re_synthetic_test_only_key", AUTH_EMAIL_FROM: "auth@sender.example" };
const message = { to: "recipient@example.test", subject: "로그인", html: "<p>test</p>", text: "test" };
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("transactional email boundary", () => {
  it("requires server configuration without including supplied secrets in errors", () => {
    expect(requireEmailEnvironment(environment)).toEqual({ apiKey: "re_synthetic_test_only_key", from: "auth@sender.example" });
    for (const invalid of [{}, { ...environment, RESEND_API_KEY: "replace-with-secret" },
      { ...environment, AUTH_EMAIL_FROM: "private\r\nBcc: attacker@example.test" }]) {
      expect(() => requireEmailEnvironment(invalid)).toThrow(/RESEND_API_KEY|AUTH_EMAIL_FROM/);
    }
  });

  it("sends text and escaped HTML through the real SDK transport boundary", async () => {
    const requests: Array<{ body: Record<string, unknown>; authorization: string | null }> = [];
    vi.stubGlobal("fetch", async (_input: unknown, init: RequestInit) => {
      requests.push({ body: JSON.parse(String(init.body)), authorization: new Headers(init.headers).get("authorization") });
      return Response.json({ id: "synthetic-provider-id" });
    });
    await createResendEmailSender(requireEmailEnvironment(environment)).send(message);
    expect(requests).toHaveLength(1);
    expect(requests[0].body).toEqual({ ...message, from: "셀러방패 <auth@sender.example>" });
    expect(requests[0].authorization).toBe("Bearer re_synthetic_test_only_key");
  });

  it("fails on SDK-returned errors and transport exceptions without exposing payloads", async () => {
    const logging = vi.spyOn(console, "error");
    const sender = createResendEmailSender(requireEmailEnvironment(environment));
    vi.stubGlobal("fetch", async () => Response.json({ name: "validation_error", message: "private recipient/token" }, { status: 403 }));
    await expect(sender.send(message)).rejects.toThrow("Email delivery unavailable.");
    vi.stubGlobal("fetch", async () => { throw new Error("private provider data"); });
    await expect(sender.send(message)).rejects.toThrow("Email delivery unavailable.");
    expect(logging).not.toHaveBeenCalled();
  });

  it("rejects malformed success payloads instead of claiming email delivery", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ id: 42 }));
    await expect(createResendEmailSender(requireEmailEnvironment(environment)).send(message))
      .rejects.toThrow("Email delivery unavailable.");
  });
});
