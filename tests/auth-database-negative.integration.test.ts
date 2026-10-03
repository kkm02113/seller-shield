import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import { createAuthentication } from "../src/platform/auth/factory";
import { createDatabaseConnection } from "../src/platform/db/connection";
import { requireDatabaseUrl } from "../src/platform/db/env";
import { loadDatabaseEnvironment } from "../src/platform/db/local-env";

loadDatabaseEnvironment();
const runtimeUrl = requireDatabaseUrl(process.env);
const run = promisify(execFile);

async function checkCLI(databaseUrl: string) {
  let output = "";
  let exitCode = 0;
  try {
    const result = await run(process.execPath, ["scripts/db-check.ts"], {
      env: { ...process.env, DATABASE_URL: databaseUrl }, timeout: 10_000,
    });
    output = result.stdout + result.stderr;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && "stdout" in error && "stderr" in error) {
      exitCode = typeof error.code === "number" ? error.code : -1;
      output = String(error.stdout) + String(error.stderr);
    } else {
      exitCode = -1;
      output = "Unexpected negative-path process failure; details redacted.";
    }
  }
  const sensitive = [runtimeUrl, databaseUrl, new URL(runtimeUrl).password, process.env.BETTER_AUTH_SECRET]
    .filter((value): value is string => Boolean(value));
  // Assert booleans rather than printing secrets as assertion expected values.
  return { exitCode, failedSafely: output.includes("Database connectivity check failed."), leaked: sensitive.some((value) => output.includes(value)) };
}

describe("database configuration negative paths", () => {
  it("fails with a missing runtime URL even when a valid migration URL exists", async () => {
    const result = await checkCLI("");
    expect(result.exitCode).not.toBe(0);
    expect(result.failedSafely).toBe(true);
    expect(result.leaked).toBe(false);
  });

  it("rejects wrong runtime credentials without exposing URLs or passwords", async () => {
    const invalid = new URL(runtimeUrl);
    invalid.password = `wrong-${randomUUID()}`;
    const result = await checkCLI(invalid.toString());
    expect(result.exitCode).not.toBe(0);
    expect(result.failedSafely).toBe(true);
    expect(result.leaked).toBe(false);
  });

  it("the official auth adapter does not fall back to the migration owner", async () => {
    const invalid = new URL(runtimeUrl);
    invalid.password = `wrong-${randomUUID()}`;
    const connection = createDatabaseConnection(invalid.toString(), { maxConnections: 1 });
    try {
      const auth = createAuthentication(connection.db, {
        secret: "Synthetic-negative-test-secret.0123456789!", baseURL: "http://localhost:3000",
      });
      const context = await auth.$context;
      let code: unknown;
      try {
        await context.internalAdapter.findUserById(randomUUID());
      } catch (error) {
        const cause = error instanceof Error ? error.cause : undefined;
        code = cause && typeof cause === "object" && "code" in cause ? cause.code : undefined;
      }
      expect(code).toBe("28P01");
    } finally {
      await connection.client.end({ timeout: 5 });
    }
  });
});
