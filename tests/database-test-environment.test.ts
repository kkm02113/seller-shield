import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadDatabaseTestEnvironment } from "./helpers/database-test-environment";

const target = "127.0.0.1:5432/seller_shield";
const environmentFile = `DATABASE_URL=postgresql://app:synthetic@${target}\nALLOW_DESTRUCTIVE_DB_TESTS=1\nDATABASE_TEST_TARGET=${target}\n`;
afterEach(() => vi.unstubAllEnvs());

function environmentFixture(check: (directory: string) => void) {
  const directory = mkdtempSync(join(tmpdir(), "seller-shield-env-test-"));
  const path = join(directory, ".env.local");
  writeFileSync(path, environmentFile);
  for (const key of ["DATABASE_URL", "DATABASE_MIGRATION_URL", "DATABASE_TEST_ADMIN_URL", "ALLOW_DESTRUCTIVE_DB_TESTS", "DATABASE_TEST_TARGET"]) {
    vi.stubEnv(key, undefined);
  }
  try { check(directory); } finally { unlinkSync(path); rmdirSync(directory); }
}
describe("process-only database test approval", () => {
  it("cannot enable destructive local tests from saved .env.local approvals", () => {
    environmentFixture((directory) => {
      expect(() => loadDatabaseTestEnvironment(directory)).toThrow(/Unsafe database test target/);
      expect(process.env.ALLOW_DESTRUCTIVE_DB_TESTS).toBeUndefined();
      expect(process.env.DATABASE_TEST_TARGET).toBeUndefined();
    });
  });
  it("retains a matching opt-in supplied by the invoking process", () => {
    environmentFixture((directory) => {
      vi.stubEnv("ALLOW_DESTRUCTIVE_DB_TESTS", "1"); vi.stubEnv("DATABASE_TEST_TARGET", target);
      expect(() => loadDatabaseTestEnvironment(directory)).not.toThrow();
    });
  });
});
