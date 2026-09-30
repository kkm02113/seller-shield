import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadDatabaseEnvironment } from "../src/platform/db/local-env";

let directory: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "seller-shield-env-"));
  vi.stubEnv("DATABASE_URL", undefined);
  vi.stubEnv("DATABASE_MIGRATION_URL", undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(directory, { recursive: true, force: true });
});

describe("database command environment files", () => {
  it("prefers .env.local over .env for both database roles", () => {
    writeFileSync(join(directory, ".env.local"),
      "DATABASE_URL=local-runtime\nDATABASE_MIGRATION_URL=local-migrator\n");
    writeFileSync(join(directory, ".env"),
      "DATABASE_URL=fallback-runtime\nDATABASE_MIGRATION_URL=fallback-migrator\n");

    loadDatabaseEnvironment(directory);

    expect(process.env.DATABASE_URL).toBe("local-runtime");
    expect(process.env.DATABASE_MIGRATION_URL).toBe("local-migrator");
  });

  it("preserves explicit process overrides for both database roles", () => {
    vi.stubEnv("DATABASE_URL", "override-runtime");
    vi.stubEnv("DATABASE_MIGRATION_URL", "override-migrator");
    writeFileSync(join(directory, ".env.local"),
      "DATABASE_URL=local-runtime\nDATABASE_MIGRATION_URL=local-migrator\n");

    loadDatabaseEnvironment(directory);

    expect(process.env.DATABASE_URL).toBe("override-runtime");
    expect(process.env.DATABASE_MIGRATION_URL).toBe("override-migrator");
  });

  it("uses .env as a fallback when .env.local is absent", () => {
    writeFileSync(join(directory, ".env"), "DATABASE_URL=fallback-runtime\n");

    loadDatabaseEnvironment(directory);

    expect(process.env.DATABASE_URL).toBe("fallback-runtime");
  });

  it("does not invent credentials when no environment file exists", () => {
    loadDatabaseEnvironment(directory);

    expect(process.env.DATABASE_URL).toBeUndefined();
    expect(process.env.DATABASE_MIGRATION_URL).toBeUndefined();
  });
});
