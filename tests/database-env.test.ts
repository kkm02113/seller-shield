import { describe, expect, it } from "vitest";

import {
  requireDatabaseUrl,
  requireMigrationDatabaseUrl,
  type DatabaseEnvironment,
} from "../src/platform/db/env";

function captureError(run: () => unknown): Error {
  try {
    run();
  } catch (error) {
    if (error instanceof Error) {
      return error;
    }
  }

  throw new Error("Expected the operation to throw an Error.");
}

describe("database environment", () => {
  it.each([
    "postgres://seller:password@localhost:5432/seller_shield",
    "postgresql://seller:password@localhost:5432/seller_shield",
  ])("accepts a valid PostgreSQL URL using %s", (databaseUrl) => {
    expect(
      requireDatabaseUrl({ DATABASE_URL: `  ${databaseUrl}  ` }),
    ).toBe(databaseUrl);
  });

  it.each([undefined, "", "   "])(
    "rejects a missing runtime database URL (%s)",
    (databaseUrl) => {
      expect(() => requireDatabaseUrl({ DATABASE_URL: databaseUrl })).toThrow(
        "DATABASE_URL is required.",
      );
    },
  );

  it.each([
    "not-a-url",
    "https://seller:secret@database.example/seller_shield",
  ])("rejects a non-PostgreSQL runtime URL without exposing it", (value) => {
    const error = captureError(() => requireDatabaseUrl({ DATABASE_URL: value }));

    expect(error.message).toBe("DATABASE_URL must be a valid PostgreSQL URL.");
    expect(error.message).not.toContain(value);
  });

  it("requires the migration-owner URL separately from the runtime URL", () => {
    const environment: DatabaseEnvironment = {
      DATABASE_URL: "postgresql://runtime:secret@localhost/seller_shield",
    };

    expect(() => requireMigrationDatabaseUrl(environment)).toThrow(
      "DATABASE_MIGRATION_URL is required.",
    );
  });

  it("accepts the migration-owner PostgreSQL URL", () => {
    const migrationUrl =
      "postgresql://migration-owner:secret@localhost/seller_shield";

    expect(
      requireMigrationDatabaseUrl({ DATABASE_MIGRATION_URL: migrationUrl }),
    ).toBe(migrationUrl);
  });
});
