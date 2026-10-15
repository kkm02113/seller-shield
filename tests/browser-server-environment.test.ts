import { describe, expect, it } from "vitest";
import { browserServerEnvironment } from "./helpers/browser-server-environment";

describe("browser test server credential boundary", () => {
  it("overrides inherited administrative/test approvals without dropping runtime/auth configuration", () => {
    const inherited = { DATABASE_URL: "synthetic-runtime", DATABASE_TEST_ADMIN_URL: "synthetic-admin",
      DATABASE_PROVISION_URL: "synthetic-provision", DATABASE_MIGRATION_URL: "synthetic-owner",
      ALLOW_DESTRUCTIVE_DB_TESTS: "1", DATABASE_TEST_TARGET: "127.0.0.1:5432/seller_shield" };
    const effective = { ...inherited, ...browserServerEnvironment("synthetic-secret", "http://localhost:3000") };
    expect(effective.DATABASE_URL).toBe("synthetic-runtime");
    for (const key of ["DATABASE_TEST_ADMIN_URL", "DATABASE_PROVISION_URL", "DATABASE_MIGRATION_URL",
      "ALLOW_DESTRUCTIVE_DB_TESTS", "DATABASE_TEST_TARGET"] as const) expect(effective[key]).toBe("");
    expect(effective.BETTER_AUTH_SECRET).toBe("synthetic-secret");
    expect(effective.BETTER_AUTH_URL).toBe("http://localhost:3000");
  });
});
