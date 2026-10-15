import { describe, expect, it } from "vitest";

import { assertDatabaseTestTarget } from "./helpers/database-test-target";

const runtime = "postgresql://app:synthetic-password@127.0.0.1:5432/seller_shield";
const environment = { DATABASE_URL: runtime };
const localOptIn = { ...environment, ALLOW_DESTRUCTIVE_DB_TESTS: "1", DATABASE_TEST_TARGET: "127.0.0.1:5432/seller_shield" };

describe("database test target safety", () => {
  it("rejects non-test database names before any database client is created", () => {
    expect(() => assertDatabaseTestTarget(environment)).toThrow("Unsafe database test target; use a dedicated *_test database or an explicitly confirmed local target.");
  });
  it("accepts a dedicated test database name", () => {
    expect(() => assertDatabaseTestTarget({ DATABASE_URL: runtime.replace("seller_shield", "seller_shield_test") })).not.toThrow();
  });
  it("requires an exact local target confirmation as well as the opt-in", () => {
    expect(() => assertDatabaseTestTarget(localOptIn)).not.toThrow();
    for (const invalid of [{ ...environment, ALLOW_DESTRUCTIVE_DB_TESTS: "1" },
      { ...localOptIn, DATABASE_TEST_TARGET: "127.0.0.1:5432/other" },
      { ...localOptIn, ALLOW_DESTRUCTIVE_DB_TESTS: "true" }]) {
      expect(() => assertDatabaseTestTarget(invalid)).toThrow(/Unsafe database test target/);
    }
  });
  it("cannot opt a remote non-test database in", () => {
    expect(() => assertDatabaseTestTarget({ ...localOptIn,
      DATABASE_URL: runtime.replace("127.0.0.1", "production.example"),
      DATABASE_TEST_TARGET: "production.example:5432/seller_shield" })).toThrow(/Unsafe database test target/);
  });
  it("requires every supplied runtime, migration and admin URL to identify the same target", () => {
    expect(() => assertDatabaseTestTarget({ ...localOptIn,
      DATABASE_MIGRATION_URL: runtime.replace("app:", "migrator:"),
      DATABASE_TEST_ADMIN_URL: runtime.replace("app:", "admin:") })).not.toThrow();
    for (const key of ["DATABASE_MIGRATION_URL", "DATABASE_TEST_ADMIN_URL"]) {
      for (const alternate of [runtime.replace("seller_shield", "other_test"), runtime.replace("5432", "5433")]) {
        expect(() => assertDatabaseTestTarget({ ...localOptIn, [key]: alternate })).toThrow(/Unsafe database test target/);
      }
    }
  });
  it("rejects missing, malformed and non-PostgreSQL URLs with static secret-free errors", () => {
    for (const value of [undefined, "", "private-secret", "https://app:private-secret@example.test/db_test", runtime.replace("/seller_shield", "/")]) {
      expect(() => assertDatabaseTestTarget({ DATABASE_URL: value })).toThrow(/Unsafe database test target/);
    }
  });
  it("rejects URL query options that can overwrite the driver's actual connection target or user", () => {
    const testUrl = runtime.replace("seller_shield", "seller_shield_test");
    for (const query of ["database=customer_db", "user=postgres", "host=production.example", "port=5433", "options=-c%20role%3Dpostgres"]) {
      expect(() => assertDatabaseTestTarget({ DATABASE_URL: `${testUrl}?${query}` })).toThrow(/Unsafe database test target/);
      expect(() => assertDatabaseTestTarget({ DATABASE_URL: testUrl, DATABASE_TEST_ADMIN_URL: `${testUrl}?${query}` }))
        .toThrow(/Unsafe database test target/);
    }
  });
});
