import { describe, expect, it } from "vitest";

import { buildMagicLinkEmail, confirmationURL, verificationDestination } from "../src/platform/auth/magic-link";
import { onboardingDestination, parseMagicLinkBody, parseMagicLinkQuery, parseName } from "../src/platform/auth/validation";

const token = "abcdefghijklmnopqrstuvwxyzABCDEF";

describe("Seller Shield Magic Link boundaries", () => {
  it("puts the raw token only in a custom confirmation fragment", () => {
    expect(confirmationURL("https://seller.example", token))
      .toBe("https://seller.example/auth/verify#token=abcdefghijklmnopqrstuvwxyzABCDEF");
    const email = buildMagicLinkEmail("seller@example.test", "https://seller.example", token);
    expect(email.text).toContain("https://seller.example/auth/verify#token=");
    expect(email.html).not.toContain("/api/auth/magic-link/verify");
    expect(email.text).toContain("5분");
    expect(email.to).toBe("seller@example.test");
  });

  it("uses only fixed local callbacks after an explicit confirmation action", () => {
    const destination = new URL(verificationDestination(`#token=${token}`), "https://seller.example");
    expect(destination.pathname).toBe("/api/auth/magic-link/verify");
    expect(destination.searchParams.get("token")).toBe(token);
    expect(destination.searchParams.get("callbackURL")).toBe("/auth/callback");
    expect(destination.searchParams.get("newUserCallbackURL")).toBe("/auth/callback");
    expect(destination.searchParams.get("errorCallbackURL")).toBe("/sign-in");
    for (const fragment of ["", "#token=x", "#token=%3Cscript%3E", `#token=${token}&token=${token}`]) {
      expect(() => verificationDestination(fragment)).toThrow("로그인 링크를 확인할 수 없습니다.");
    }
  });

  it("canonicalizes emails without accepting pre-login names or arbitrary callbacks", () => {
    expect(parseMagicLinkBody({ email: " Seller@Example.test " })).toEqual({
      email: "seller@example.test", callbackURL: "/auth/callback",
      newUserCallbackURL: "/auth/callback", errorCallbackURL: "/sign-in",
    });
    for (const body of [
      { email: "not-an-email" }, { email: "seller@example.test", name: "Pretend onboarded" },
      { email: "seller@example.test", callbackURL: "https://evil.example" },
      { email: "seller@example.test", newUserCallbackURL: "//evil.example" },
    ]) expect(() => parseMagicLinkBody(body)).toThrow("Invalid authentication request.");
    expect(parseMagicLinkQuery({ token }).callbackURL).toBe("/auth/callback");
    expect(() => parseMagicLinkQuery({ token, errorCallbackURL: "https://evil.example" })).toThrow();
  });

  it("trims names, rejects blank/overlong names and routes unfinished returning users", () => {
    expect(parseName("  판매자 김  ")).toBe("판매자 김");
    expect(parseName("x".repeat(80))).toHaveLength(80);
    for (const name of ["", " \n\t ", "x".repeat(81), null, 42]) expect(() => parseName(name)).toThrow();
    expect(onboardingDestination(" \t ")).toBe("/onboarding");
    expect(onboardingDestination("판매자 김")).toBe("/app");
  });
});
