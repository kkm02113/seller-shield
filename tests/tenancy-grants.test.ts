import { describe, expect, it } from "vitest";
import { requireTenancyGrantConfiguration, requireTenancyProvisionConfiguration } from "../src/platform/db/tenancy-grants";

const environment = {
  DATABASE_URL: "postgresql://app:synthetic@localhost:5432/unit_test",
  DATABASE_MIGRATION_URL: "postgresql://migrator:synthetic@localhost:5432/unit_test",
  DATABASE_PROVISION_URL: "postgresql://admin:synthetic@localhost:5432/unit_test",
};
describe("tenancy role configuration", () => {
  it("keeps runtime, migration and explicit provision credentials separate", () => {
    expect(requireTenancyGrantConfiguration(environment).runtimeRole).toBe("app");
    expect(requireTenancyProvisionConfiguration(environment).migrationRole).toBe("migrator");
  });
  it("rejects missing, cross-database, shared-role and helper-as-runtime configuration", () => {
    for (const invalid of [{ ...environment, DATABASE_PROVISION_URL: undefined },
      { ...environment, DATABASE_PROVISION_URL: environment.DATABASE_URL },
      { ...environment, DATABASE_PROVISION_URL: environment.DATABASE_PROVISION_URL.replace("unit_test", "other") },
      { ...environment, DATABASE_PROVISION_URL: "https://private-secret.example/test" },
      { ...environment, DATABASE_URL: environment.DATABASE_URL.replace("app:", "seller_shield_bootstrap:") }]) {
      expect(() => requireTenancyProvisionConfiguration(invalid)).toThrow();
    }
  });
});
