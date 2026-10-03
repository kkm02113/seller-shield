import { describe, expect, it } from "vitest";

import * as environment from "../src/platform/auth/env";

const testSecret = "Test-only.SellerShield.Secret.0123456789!";

describe("authentication configuration validation", () => {
  it("requires an explicit secret without falling back to migration config", () => {
    expect(() => environment.requireAuthEnvironment({
      BETTER_AUTH_URL: "http://localhost:3000",
      DATABASE_MIGRATION_URL: "postgresql://owner:private@localhost/db",
    })).toThrow(/BETTER_AUTH_SECRET/);
  });

  it.each(["", " ", "short-secret"])("rejects missing or short secrets safely", (secret) => {
    expect(() => environment.requireAuthEnvironment({
      BETTER_AUTH_SECRET: secret,
      BETTER_AUTH_URL: "http://localhost:3000",
    })).toThrow(/BETTER_AUTH_SECRET/);
  });

  it("rejects the committed example placeholder", () => {
    expect(() => environment.requireAuthEnvironment({
      BETTER_AUTH_SECRET: "replace-with-a-random-secret-at-least-32-characters",
      BETTER_AUTH_URL: "http://localhost:3000",
    })).toThrow(/BETTER_AUTH_SECRET/);
  });

  it.each([undefined, "", "not-a-url", "ftp://localhost", "https://user:secret@example.com", "https://example.com/?token=private", "https://example.com/#private"])(
    "rejects invalid base URL without exposing configuration", (baseURL) => {
      let message = "";
      try {
        environment.requireAuthEnvironment({ BETTER_AUTH_SECRET: testSecret, BETTER_AUTH_URL: baseURL });
      } catch (error) {
        if (error instanceof Error) message = error.message;
      }
      expect(message).toMatch(/BETTER_AUTH_URL/);
      expect(message).not.toContain(testSecret);
      expect(message).not.toContain("private");
    },
  );

  it("accepts the explicit local HTTP origin and production HTTPS origin", () => {
    expect(environment.requireAuthEnvironment({ BETTER_AUTH_SECRET: testSecret, BETTER_AUTH_URL: "http://localhost:3000" }))
      .toEqual({ secret: testSecret, baseURL: "http://localhost:3000" });
    expect(environment.requireAuthEnvironment({ BETTER_AUTH_SECRET: testSecret, BETTER_AUTH_URL: "https://seller.example" }))
      .toEqual({ secret: testSecret, baseURL: "https://seller.example" });
  });
});
