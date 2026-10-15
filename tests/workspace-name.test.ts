import { describe, expect, it } from "vitest";
import { requireWorkspaceName } from "../src/modules/identity/domain/workspace-name";

describe("workspace physical name contract", () => {
  it("normalizes boundary ASCII spaces and counts PostgreSQL Unicode code points", () => {
    expect(requireWorkspaceName("  판매자 조직  ")).toBe("판매자 조직");
    expect(requireWorkspaceName("😀".repeat(80))).toBe("😀".repeat(80));
    // btrim() does not remove tabs/non-breaking spaces; do not silently invent a different rule.
    expect(requireWorkspaceName("\t조직\u00a0")).toBe("\t조직\u00a0");
  });
  it("rejects non-text, empty, overlong and PostgreSQL-invalid NUL input", () => {
    for (const input of [null, undefined, {}, "", "   ", "😀".repeat(81), "name\0value"]) {
      expect(() => requireWorkspaceName(input)).toThrow("Workspace name requires 1–80 characters.");
    }
  });
});
