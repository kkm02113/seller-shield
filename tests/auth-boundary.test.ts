import { afterEach, describe, expect, it, vi } from "vitest";

// Only bypass Next's compile-time marker in Node tests; auth and DB are not mocked.
vi.mock("server-only", () => ({}));

import { getAuth } from "../src/platform/auth/auth";

afterEach(() => vi.unstubAllEnvs());

describe("server-only authentication environment boundary", () => {
  it("rejects a missing secret before initializing the database", async () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "");
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
    vi.stubEnv("DATABASE_URL", "");
    await expect(getAuth()).rejects.toThrow(/BETTER_AUTH_SECRET/);
  });

  it("rejects an invalid public origin with a static, secret-free error", async () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "Synthetic-boundary-secret.0123456789!");
    vi.stubEnv("BETTER_AUTH_URL", "https://user:private@example.test/path");
    await expect(getAuth()).rejects.toThrow("BETTER_AUTH_URL requires an HTTPS origin or a local HTTP origin.");
  });
});
