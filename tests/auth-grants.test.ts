import { describe, expect, it } from "vitest";

import * as grants from "../src/platform/db/auth-grants";

const runtime = "postgresql://runtime:synthetic@localhost:5432/test_db";
const migration = "postgresql://migrator:synthetic@localhost:5432/test_db";

describe("explicit authentication table grants", () => {
  it("requires both URLs and refuses owner fallback or a different database", () => {
    expect(() => grants.requireAuthGrantConfiguration({ DATABASE_MIGRATION_URL: migration })).toThrow(/DATABASE_URL/);
    expect(() => grants.requireAuthGrantConfiguration({ DATABASE_URL: runtime })).toThrow(/DATABASE_MIGRATION_URL/);
    for (const invalid of [runtime, migration.replace("test_db", "other_db"), migration.replace("localhost", "other-host")]) {
      expect(() => grants.requireAuthGrantConfiguration({ DATABASE_URL: runtime, DATABASE_MIGRATION_URL: invalid }))
        .toThrow(/separate roles on the same database/);
    }
  });

  it("uses the runtime role as an identifier and never as SQL text", () => {
    expect(grants.requireAuthGrantConfiguration({ DATABASE_URL: runtime, DATABASE_MIGRATION_URL: migration }))
      .toEqual({ runtimeUrl: runtime, migrationUrl: migration, runtimeRole: "runtime" });
  });
});
