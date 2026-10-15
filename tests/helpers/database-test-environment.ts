import { loadDatabaseEnvironment } from "../../src/platform/db/local-env.ts";
import { assertDatabaseTestTarget } from "./database-test-target.ts";

export function loadDatabaseTestEnvironment(directory = process.cwd()): void {
  // An explicit test-run approval must come from the invoking process, not
  // from a reusable .env file. Restore the original values before validation.
  const keys = ["ALLOW_DESTRUCTIVE_DB_TESTS", "DATABASE_TEST_TARGET"] as const;
  const original = keys.map((key) => process.env[key]);
  try {
    loadDatabaseEnvironment(directory);
  } finally {
    keys.forEach((key, index) => {
      if (original[index] === undefined) delete process.env[key];
      else process.env[key] = original[index];
    });
  }
  assertDatabaseTestTarget(process.env);
}
