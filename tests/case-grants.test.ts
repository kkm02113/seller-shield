import { describe, expect, it } from "vitest";
import { requireCaseGrantConfiguration } from "../src/platform/db/case-grants";

const environment = { DATABASE_URL: "postgres://app:synthetic@localhost:5432/unit_test",
  DATABASE_MIGRATION_URL: "postgres://migrator:synthetic@localhost:5432/unit_test" };
describe("Case grant configuration", () => {
  it("requires separate roles on the same database", () => {
    expect(requireCaseGrantConfiguration(environment)).toEqual({ runtimeUrl: environment.DATABASE_URL,
      migrationUrl: environment.DATABASE_MIGRATION_URL, runtimeRole: "app" });
    for (const DATABASE_MIGRATION_URL of [environment.DATABASE_URL, "postgres://owner:secret@other/unit_test", "postgres://owner:secret@localhost/different"]) {
      expect(() => requireCaseGrantConfiguration({ ...environment, DATABASE_MIGRATION_URL })).toThrow();
    }
  });
  it.each(["DATABASE_URL", "DATABASE_MIGRATION_URL"])("rejects startup target/role query overrides on %s without leaking credentials", (key) => {
    for (const suffix of ["?host=other", "?user=postgres", "?options=-c%20role%3Dpostgres", "?sslmode=require"]) {
      let message = "";
      try { requireCaseGrantConfiguration({ ...environment, [key]: environment[key as keyof typeof environment] + suffix }); }
      catch (error) { message = (error as Error).message; }
      expect(message).toBe("Case grants require separate non-helper roles on one database without URL query options; details redacted.");
      expect(message).not.toMatch(/synthetic|postgres:\/\//);
    }
  });
  it("rejects missing URLs, malformed values and the privileged helper identity", () => {
    for (const override of [{ DATABASE_URL: undefined }, { DATABASE_MIGRATION_URL: "invalid-secret" },
      { DATABASE_URL: "postgres://seller_shield_bootstrap:secret@localhost:5432/unit_test" }]) {
      expect(() => requireCaseGrantConfiguration({ ...environment, ...override })).toThrow("details redacted");
    }
  });
});
